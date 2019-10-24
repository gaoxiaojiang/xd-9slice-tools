// XD拡張APIのクラスをインポート
const {
  Artboard,
  Text,
  Color,
  ImageFill,
  Line,
  Rectangle,
  GraphicNode,
  selection,
} = require('scenegraph')
const application = require('application')
const commands = require('commands')
const fs = require('uxp').storage.localFileSystem

/**
 * Shorthand for creating Elements.
 * @param {*} tag The tag name of the element.
 * @param {*} [props] Optional props.
 * @param {*} children Child elements or strings
 */
function h(tag, props, ...children) {
  let element = document.createElement(tag)
  if (props) {
    if (props.nodeType || typeof props !== 'object') {
      children.unshift(props)
    } else {
      for (let name in props) {
        let value = props[name]
        if (name == 'style') {
          Object.assign(element.style, value)
        } else {
          element.setAttribute(name, value)
          element[name] = value
        }
      }
    }
  }
  for (let child of children) {
    element.appendChild(
      typeof child === 'object' ? child : document.createTextNode(child),
    )
  }
  return element
}

/**
 * alertの表示
 * @param {string} message
 */
async function alert(message, title) {
  if (title == null) {
    title = 'XD Baum2 Export'
  }
  let dialog = h(
    'dialog',
    h(
      'form',
      {
        method: 'dialog',
        style: {
          width: 400,
        },
      },
      h('h1', title),
      h('hr'),
      h('span', message),
      h(
        'footer',
        h(
          'button',
          {
            uxpVariant: 'primary',
            onclick(e) {
              dialog.close()
            },
          },
          'Close',
        ),
      ),
    ),
  )
  document.body.appendChild(dialog)
  return await dialog.showModal()
}

function get9sliceParamters(str) {
  var pattern = /@9slice=([0-9]+)(px)[^0-9]?([0-9]+)?(px)?[^0-9]?([0-9]+)?(px)?[^0-9]?([0-9]+)?(px)?[^0-9]?/
  var result = str.match(pattern)
  //console.log(result)
  /*
  省略については、CSSに準拠
  http://www.htmq.com/css3/border-image-slice.shtml
  上・右・下・左(時計回り)の端から内側へのオフセット量
  4番目の値が省略された場合には、2番目の値と同じ。
  3番目の値が省略された場合には、1番目の値と同じ。
  2番目の値が省略された場合には、1番目の値と同じ。
  */
  if (result[3] == null) {
    result[3] = result[1]
  }
  if (result[5] == null) {
    result[5] = result[1]
  }
  if (result[7] == null) {
    result[7] = result[3]
  }
  if (result[1] == null) {
    return null
  }
  return {
    top: parseInt(result[1]),
    right: parseInt(result[3]),
    bottom: parseInt(result[5]),
    left: parseInt(result[7]),
  }
}

function SetGlobalBounds(node, newGlobalBounds) {
  const globalBounds = node.globalBounds
  const deltaX = newGlobalBounds.x - globalBounds.x
  const deltaY = newGlobalBounds.y - globalBounds.y
  node.moveInParentCoordinates(deltaX, deltaY)
  node.resize(newGlobalBounds.width, newGlobalBounds.height)
}

function SetGlobalPosition(node, newPosition) {
  const globalBounds = node.globalBounds
  const deltaX = newPosition.x - globalBounds.x
  const deltaY = newPosition.y - globalBounds.y
  node.moveInParentCoordinates(deltaX, deltaY)
}

function getNaturalSize(node) {}

/**
 * スライスノード内のリサイズ
 * @param {*} mask
 * @param {*} graphicNode
 * @param {*} leftPx
 * @param {*} rightPx
 */
function scaleAdjustTop(
  mode,
  wholeGlobalBounds,
  mask,
  graphicNode,
  sliceParameter,
) {
  const sliceLeftPx = sliceParameter['left']
  const sliceRightPx = sliceParameter['right']
  const sliceTopPx = sliceParameter['top']
  const sliceBottomPx = sliceParameter['bottom']
  var imageFill = graphicNode.fill
  if (imageFill == null || imageFill.constructor.name != 'ImageFill') {
    console.log('*** イメージがありません')
    return
  }
  var maskBounds = mask.globalBounds
  var graphicBounds = graphicNode.globalDrawBounds

  // SCALE_STRETCH(サイズに合わせて変形する)じゃないと、対応できない
  imageFill.scaleBehavior = ImageFill.SCALE_STRETCH
  if (imageFill.scaleBehavior != ImageFill.SCALE_STRETCH) {
    // SCALE_STRETCHにしたが、変更できなかった
    alert('SCALE_STRETCHモードに変更できませんでした')
    return
  }

  var newMaskBounds = null
  var newGraphicBounds = null

  switch (mode) {
    case 'top-left':
      if (sliceTopPx == 0) break
      if (sliceLeftPx == 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y,
        width: sliceLeftPx,
        height: sliceTopPx,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y,
        width: imageFill.naturalWidth,
        height: imageFill.naturalHeight,
      }
      break
    case 'top-right':
      if (sliceTopPx == 0) break
      if (sliceRightPx == 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - sliceRightPx,
        y: wholeGlobalBounds.y,
        width: sliceRightPx,
        height: sliceTopPx,
      }
      newGraphicBounds = {
        x:
          wholeGlobalBounds.x +
          wholeGlobalBounds.width -
          imageFill.naturalWidth,
        y: wholeGlobalBounds.y,
        width: imageFill.naturalWidth,
        height: imageFill.naturalHeight,
      }
      break
    case 'right': {
      if (sliceRightPx == 0) break
      const maskNaturalHeight =
        imageFill.naturalHeight - sliceTopPx - sliceBottomPx
      const maskHeight = wholeGlobalBounds.height - sliceTopPx - sliceBottomPx
      const scaleY = maskHeight / maskNaturalHeight
      newMaskBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - sliceRightPx,
        y: wholeGlobalBounds.y + sliceTopPx,
        width: sliceRightPx,
        height: maskHeight,
      }
      newGraphicBounds = {
        x:
          wholeGlobalBounds.x +
          wholeGlobalBounds.width -
          imageFill.naturalWidth,
        y: wholeGlobalBounds.y + sliceTopPx - sliceTopPx * scaleY,
        width: imageFill.naturalWidth,
        height: imageFill.naturalHeight * scaleY,
      }
      break
    }
    case 'left': {
      if (sliceLeftPx == 0) break
      const maskNaturalHeight =
        imageFill.naturalHeight - sliceTopPx - sliceBottomPx
      const maskHeight = wholeGlobalBounds.height - sliceTopPx - sliceBottomPx
      const scaleY = maskHeight / maskNaturalHeight
      newMaskBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y + sliceTopPx,
        width: sliceLeftPx,
        height: maskHeight,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y + sliceTopPx - sliceTopPx * scaleY,
        width: imageFill.naturalWidth,
        height: imageFill.naturalHeight * scaleY,
      }
      break
    }
    case 'bottom-left':
      if (sliceBottomPx == 0) break
      if (sliceLeftPx == 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - sliceBottomPx,
        width: sliceLeftPx,
        height: sliceBottomPx,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x,
        y:
          wholeGlobalBounds.y +
          wholeGlobalBounds.height -
          imageFill.naturalHeight,
        width: imageFill.naturalWidth,
        height: imageFill.naturalHeight,
      }
      break
    case 'bottom-right':
      if (sliceBottomPx == 0) break
      if (sliceRightPx == 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - sliceRightPx,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - sliceBottomPx,
        width: sliceLeftPx,
        height: sliceTopPx,
      }
      newGraphicBounds = {
        x:
          wholeGlobalBounds.x +
          wholeGlobalBounds.width -
          imageFill.naturalWidth,
        y:
          wholeGlobalBounds.y +
          wholeGlobalBounds.height -
          imageFill.naturalHeight,
        width: imageFill.naturalWidth,
        height: imageFill.naturalHeight,
      }
      break
    case 'top': {
      if (sliceTopPx == 0) break
      const maskNaturalWidth =
        imageFill.naturalWidth - sliceRightPx - sliceLeftPx
      const maskWidth = wholeGlobalBounds.width - sliceRightPx - sliceLeftPx
      const maskHeight = sliceTopPx
      const scaleX = maskWidth / maskNaturalWidth
      newMaskBounds = {
        x: wholeGlobalBounds.x + sliceLeftPx,
        y: wholeGlobalBounds.y,
        width: maskWidth,
        height: maskHeight,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x + sliceLeftPx - sliceLeftPx * scaleX,
        y: wholeGlobalBounds.y,
        width: imageFill.naturalWidth * scaleX,
        height: imageFill.naturalHeight,
      }
      break
    }
    case 'bottom': {
      if (sliceBottomPx == 0) break
      const maskNaturalWidth =
        imageFill.naturalWidth - sliceRightPx - sliceLeftPx
      const maskWidth = wholeGlobalBounds.width - sliceRightPx - sliceLeftPx
      const maskHeight = sliceTopPx
      const scaleX = maskWidth / maskNaturalWidth
      newMaskBounds = {
        x: wholeGlobalBounds.x + sliceLeftPx,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - sliceBottomPx,
        width: maskWidth,
        height: maskHeight,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x + sliceLeftPx - sliceLeftPx * scaleX,
        y:
          wholeGlobalBounds.y +
          wholeGlobalBounds.height -
          imageFill.naturalHeight,
        width: imageFill.naturalWidth * scaleX,
        height: imageFill.naturalHeight,
      }
      break
    }
    case 'center': {
      const maskNaturalWidth =
        imageFill.naturalWidth - sliceRightPx - sliceLeftPx
      const maskNaturalHeight =
        imageFill.naturalHeight - sliceTopPx - sliceBottomPx
      const maskWidth = wholeGlobalBounds.width - sliceRightPx - sliceLeftPx
      const maskHeight = wholeGlobalBounds.height - sliceTopPx - sliceBottomPx
      const scaleX = maskWidth / maskNaturalWidth
      const scaleY = maskHeight / maskNaturalHeight
      newMaskBounds = {
        x: wholeGlobalBounds.x + sliceLeftPx,
        y: wholeGlobalBounds.y + sliceTopPx,
        width: maskWidth,
        height: maskHeight,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x + sliceLeftPx - sliceLeftPx * scaleX,
        y: wholeGlobalBounds.y + sliceTopPx - sliceTopPx * scaleY,
        width: imageFill.naturalWidth * scaleX,
        height: imageFill.naturalHeight * scaleY,
      }
      break
    }
  }

  if (newMaskBounds != null) {
    SetGlobalBounds(mask, newMaskBounds)
  }

  if (newGraphicBounds != null) {
    SetGlobalBounds(graphicNode, newGraphicBounds)
  }

  if (newMaskBounds == null || newGraphicBounds == null) {
    return false
  }
  return true
}

/**
 *
 * @param {SceneNode} sliceNode
 */
function scaleAdjustSliceRegroup(wholeGlobalBounds, sliceNode, sliceParameter) {
  var mask = sliceNode.mask
  if (!mask) {
    console.log('*** not found mask')
    return
  }

  var children = []
  sliceNode.children.forEach(child => {
    children.push(child)
  })

  const sliceNodeName = sliceNode.name
  var parent = sliceNode.parent
  selection.items = [sliceNode]

  // 操作できるようにグループ解除
  commands.ungroup()

  var maskGroupItems = [mask]
  var visible = true
  var image = children.forEach(child => {
    // スライスノード内 リサイズの必要なものを探す
    if (child == mask) return
    var result = scaleAdjustTop(
      sliceNodeName,
      wholeGlobalBounds,
      mask,
      child,
      sliceParameter,
    )
    if (!result) {
      visible = false
    }
    maskGroupItems.push(child)
  })

  // 元通りのグループ化
  selection.items = maskGroupItems
  commands.createMaskGroup()

  var maskGroup = selection.items[0]
  maskGroup.name = sliceNodeName
  maskGroup.visible = visible
}

/**
 * 選択したノードを画像出力する
 * 画像出力のテスト用
 * @param {*} selection
 * @param {*} root
 */
async function pluginScaleAdjust(selection, root) {
  var selectionItems = []
  selection.items.forEach(item => {
    selectionItems.push(item)
  })

  var bounds = selection.items[0].parent.globalBounds

  selectionItems.forEach(item => {
    /*
    // Root Childを選んでやる場合
    item.children.forEach(child => {
      if (child.name == 'top') {
        var bounds = child.parent.globalDrawBounds
        console.log('----------------')
        console.log(bounds)
        scaleAdjustSlice(bounds, child)
      }
    })
    */
    // topを選んだ場合
    console.log(item.parent.name)
    const sliceParameter = get9sliceParamters(item.parent.name)
    if (sliceParameter != null) {
      scaleAdjustSliceRegroup(bounds, item, sliceParameter)
    }
    /*
    // 直接選んだ場合
    var bounds = item.parent.parent.globalBounds
    console.log(bounds.width)
    const sliceParameter = get9sliceParamters(item.parent.parent.name)
    scaleAdjustSlice(bounds, item.parent, sliceParameter)
    */
  })
}

async function pluginMake9Slice(slection, root) {
  var selectionItems = []
  selection.items.forEach(item => {
    selectionItems.push(item)
  })

  selectionItems.forEach(item => {
    var itemName = item.name
    const parameter = get9sliceParamters(itemName)
    if (item.fill != null) {
      var shape1 = new Rectangle()
      selection.insertionParent.addChild(shape1)
      SetGlobalBounds(shape1, item.globalBounds)
      selection.items = [item, shape1]
      commands.createMaskGroup()
      var slices = [selection.items[0]]
      selection.items[0].name = 'top-left'
      const names = [
        'top',
        'top-right',
        'left',
        'center',
        'right',
        'bottom-left',
        'bottom',
        'bottom-right',
      ]
      names.forEach(name => {
        commands.duplicate()
        selection.items[0].name = name
        slices.push(selection.items[0])
      })
      selection.items = slices
      commands.group()
      selection.items[0].name = itemName
    }
  })

  console.log('done')
}

function pluginChangeScaleBehavior(slection, root) {
  selection.items.forEach(item => {
    var clone = null
    var fill = item.fill
    if (fill != null) {
      console.log(fill)
      console.log('change')
      fill.scaleBehavior = ImageFill.SCALE_STRETCH
      console.log(fill.scaleBehavior)
      if (fill.scaleBehavior != ImageFill.SCALE_STRETCH) {
        console.log('fail')
        console.log(fill.scaleBehavior)
      } else {
        clone = fill.clone
        var rect = new GraphicNode()
        rect.width = 100
        rect.height = 100
        rect.fill = clone
        selection.insertionParent.addChild(rect)
        selection.items = [rect]
      }
    }
  })
}

module.exports = {
  // コマンドIDとファンクションの紐付け
  commands: {
    pluginScaleAdjust: pluginScaleAdjust,
    pluginMake9Slice: pluginMake9Slice,
    pluginChangeScaleBehavior: pluginChangeScaleBehavior,
  },
}
