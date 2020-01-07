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
        if (name === 'style') {
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

/**
 * パラメータの取得
 * @param str
 * @returns {null|{top: number, left: number, bottom: number, right: number}}
 */
function getImageSliceParameters(str) {
  // 正規表現テスト
  // https://regex101.com/
  const pattern = /([^{]*){\s*image-slice\s*:\s*(?<top>[0-9]+)(px)[^0-9]?(?<right>[0-9]+)?(px)?[^0-9]?(?<bottom>[0-9]+)?(px)?[^0-9]?(?<left>[0-9]+)?(px)?[^0-9]?/gi
  let result = pattern.exec(str)
  /*
  省略については、CSSに準拠
  http://www.htmq.com/css3/border-image-slice.shtml
  上・右・下・左(時計回り)の端から内側へのオフセット量
  4番目の値が省略された場合には、2番目の値と同じ。
  3番目の値が省略された場合には、1番目の値と同じ。
  2番目の値が省略された場合には、1番目の値と同じ。
  */
  if (!result || !result.groups.top) return null // 一つも値がとれなかったとき
  let top = parseInt(result.groups.top)
  let right = result.groups.right ? parseInt(result.groups.right) : top
  let bottom = result.groups.bottom ? parseInt(result.groups.bottom) : top
  let left = result.groups.left ? parseInt(result.groups.left) : right

  return {
    top,
    right,
    bottom,
    left,
  }
}

/**
 * @param {SceneNodeClass} node
 * @param {Bounds} newGlobalBounds
 * @constructor
 */
function SetGlobalBounds(node, newGlobalBounds) {
  const globalBounds = node.globalBounds
  //現在の座標から動かす差分を取得
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
 * スライスノード内のマスクと絵を持つノードを9スライス用にリサイズ
 * @param {string} typeName パーツ名 top,center,top-left等
 * @param wholeGlobalBounds
 * @param {SceneNodeClass|null} mask  リサイズするマスクノード nullでも良い
 * @param {SceneNodeClass} graphicNode
 * @param {{top:number, left:number, bottom:number, right:number}} sliceParameter　9スライスパラメータ
 * @returns {boolean}
 */
function resizeMaskAndGraphicNode(
  typeName,
  wholeGlobalBounds,
  mask,
  graphicNode,
  sliceParameter,
) {
  const sliceLeftPx = sliceParameter.left
  const sliceRightPx = sliceParameter.right
  const sliceTopPx = sliceParameter.top
  const sliceBottomPx = sliceParameter.bottom

  let naturalWidth = null
  let naturalHeight = null

  let imageFill = graphicNode.fill
  if (imageFill == null || imageFill.constructor.name !== 'ImageFill') {
    let parent = graphicNode.parent
    parent.children.forEach(child => {
      if (child.name === 'source') {
        console.log('find source')
        naturalWidth = child.globalBounds.width
        naturalHeight = child.globalBounds.height
      }
    })
  } else {
    naturalWidth = imageFill.naturalWidth
    naturalHeight = imageFill.naturalHeight
  }
  if (naturalWidth == null || naturalHeight == null) {
    alert('sourceがみつかりません')
    return false
  }

  let graphicBounds = graphicNode.globalDrawBounds

  let newMaskBounds = null
  let newGraphicBounds = null

  switch (typeName) {
    case 'top-left':
      if (sliceTopPx === 0) break
      if (sliceLeftPx === 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y,
        width: sliceLeftPx,
        height: sliceTopPx,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y,
        width: naturalWidth,
        height: naturalHeight,
      }
      break
    case 'top-right':
      if (sliceTopPx === 0) break
      if (sliceRightPx === 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - sliceRightPx,
        y: wholeGlobalBounds.y,
        width: sliceRightPx,
        height: sliceTopPx,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - naturalWidth,
        y: wholeGlobalBounds.y,
        width: naturalWidth,
        height: naturalHeight,
      }
      break
    case 'right': {
      if (sliceRightPx === 0) break
      const maskNaturalHeight = naturalHeight - sliceTopPx - sliceBottomPx
      const maskHeight = wholeGlobalBounds.height - sliceTopPx - sliceBottomPx
      const scaleY = maskHeight / maskNaturalHeight
      newMaskBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - sliceRightPx,
        y: wholeGlobalBounds.y + sliceTopPx,
        width: sliceRightPx,
        height: maskHeight,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - naturalWidth,
        y: wholeGlobalBounds.y + sliceTopPx - sliceTopPx * scaleY,
        width: naturalWidth,
        height: naturalHeight * scaleY,
      }
      break
    }
    case 'left': {
      if (sliceLeftPx === 0) break
      const maskNaturalHeight = naturalHeight - sliceTopPx - sliceBottomPx
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
        width: naturalWidth,
        height: naturalHeight * scaleY,
      }
      break
    }
    case 'bottom-left':
      if (sliceBottomPx === 0) break
      if (sliceLeftPx === 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - sliceBottomPx,
        width: sliceLeftPx,
        height: sliceBottomPx,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - naturalHeight,
        width: naturalWidth,
        height: naturalHeight,
      }
      break
    case 'bottom-right':
      if (sliceBottomPx === 0) break
      if (sliceRightPx === 0) break
      newMaskBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - sliceRightPx,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - sliceBottomPx,
        width: sliceLeftPx,
        height: sliceTopPx,
      }
      newGraphicBounds = {
        x: wholeGlobalBounds.x + wholeGlobalBounds.width - naturalWidth,
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - naturalHeight,
        width: naturalWidth,
        height: naturalHeight,
      }
      break
    case 'top': {
      if (sliceTopPx === 0) break
      const maskNaturalWidth = naturalWidth - sliceRightPx - sliceLeftPx
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
        width: naturalWidth * scaleX,
        height: naturalHeight,
      }
      break
    }
    case 'bottom': {
      if (sliceBottomPx === 0) break
      const maskNaturalWidth = naturalWidth - sliceRightPx - sliceLeftPx
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
        y: wholeGlobalBounds.y + wholeGlobalBounds.height - naturalHeight,
        width: naturalWidth * scaleX,
        height: naturalHeight,
      }
      break
    }
    case 'center': {
      const maskNaturalWidth = naturalWidth - sliceRightPx - sliceLeftPx
      const maskNaturalHeight = naturalHeight - sliceTopPx - sliceBottomPx
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
        width: naturalWidth * scaleX,
        height: naturalHeight * scaleY,
      }
      break
    }
  }

  if (mask && newMaskBounds != null) {
    SetGlobalBounds(mask, newMaskBounds)
  }

  if (graphicNode && newGraphicBounds != null) {
    SetGlobalBounds(graphicNode, newGraphicBounds)
  }

  if (newMaskBounds == null || newGraphicBounds == null) {
    return false
  }

  return true
}

/**
 * @param wholeGlobalBounds
 * @param sliceNode
 * @param sliceParameter
 */
function resizeSlicedGroup(wholeGlobalBounds, sliceNode, sliceParameter) {
  if (sliceNode.name === 'source') {
    sliceNode.resize(sliceNode.fill.naturalWidth, sliceNode.fill.naturalHeight)
    return
  }
  let mask = sliceNode.mask
  if (!mask) {
    console.log('*** not found mask')
    return
  }

  // ungroup するのでその前にグループの中身を取得しておく
  let children = []
  sliceNode.children.forEach(child => {
    children.push(child)
  })

  const sliceNodeName = sliceNode.name
  let parent = sliceNode.parent
  selection.items = [sliceNode]

  // 操作できるようにグループ解除
  commands.ungroup()

  let maskGroupItems = [mask]
  let visible = true
  let image = children.forEach(child => {
    // スライスノード内 リサイズの必要なものを探す
    if (child === mask) return // maskはリサイズしない
    let result = resizeMaskAndGraphicNode(
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

  let maskGroup = selection.items[0]
  maskGroup.name = sliceNodeName
  maskGroup.visible = visible
}

/**
 * 選択したノードを画像出力する
 * 画像出力のテスト用
 * @param {*} selection
 * @param {*} root
 */
async function pluginResizeSlices(selection, root) {
  let selectionItems = []
  selection.items.forEach(item => {
    selectionItems.push(item)
  })

  let bounds = selection.items[0].parent.globalBounds

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
    // スライスされたグループを選んだ場合
    console.log(item.parent.name)
    const sliceParameter = getImageSliceParameters(item.parent.name)
    if (sliceParameter != null) {
      resizeSlicedGroup(bounds, item, sliceParameter)
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

/**
 * Stretch変形できるものへ変換コピーする
 * @param {SceneNodeClass} item
 */
function duplicateStretchable(item) {
  let fill = item.fill
  if (fill != null && item.constructor.name === 'Rectangle') {
    // ImageFillをもったRectangleのコピー
    let rect = new Rectangle()
    rect.name = item.name + '-stretch'
    SetGlobalBounds(rect, item.globalBounds) // 同じ場所に作成
    // 新規に作成することで、元のイメージがCCライブラリのイメージでもSTRETCH変形ができる
    let cloneFill = fill.clone()
    cloneFill.scaleBehavior = ImageFill.SCALE_STRETCH
    rect.fill = cloneFill
    selection.insertionParent.addChild(rect)
    return rect
  }
  // それ以外の場合は普通にコピー
  const selectionItems = [].concat(selection.items)
  selection.items = [item]
  commands.duplicate()
  const node = selection.items[0]
  //node.removeFromParent()
  selection.items = selectionItems
  return node
}

/**
 * @param {SceneNodeClass} item
 * @param {Selection} selection
 */
function make9Slice(item, selection) {
  let itemName = item.name
  const parameter = getImageSliceParameters(itemName)
  // マスクの作成
  let mask = new Rectangle()
  mask.name = 'top-left-mask'
  selection.insertionParent.addChild(mask)
  SetGlobalBounds(mask, item.globalBounds)
  // 画像をコピーして、CCライブラリのものでも変形できるようにする
  let rectImage = duplicateStretchable(item)
  rectImage.name = 'top-left-copy'
  // 位置をソースと同じ場所にする
  SetGlobalBounds(rectImage, item.globalBounds)
  // マスクグループの作成
  selection.items = [rectImage, mask]
  commands.createMaskGroup()
  let slices = [item, selection.items[0]]
  selection.items[0].name = 'top-left'

  // 他のスライスも作成する
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
  // 一個のグループにまとめる
  selection.items = slices
  commands.group()
  selection.items[0].name = itemName
  //
  //item.removeFromParent()
  //selection.items[0].addChild(item)
  item.name = 'source'
  item.visible = false
  //
  selection.items = slices
}

async function pluginMake9Slice(selection, root) {
  let selectionItems = []
  selection.items.forEach(item => {
    selectionItems.push(item)
  })

  selectionItems.forEach(item => {
    make9Slice(item, selection)
  })

  console.log('done')
}

function pluginDuplicateStretch(slection, root) {
  selection.items.forEach(item => {
    var rect = duplicateStretchable(item)
    //selection.insertionParent.addChild(rect)
    SetGlobalBounds(rect, item.globalBounds)
    selection.items = [rect]
  })
}

module.exports = {
  // コマンドIDとファンクションの紐付け
  commands: {
    pluginScaleAdjust: pluginResizeSlices,
    pluginMake9Slice: pluginMake9Slice,
    pluginDuplicateStretch: pluginDuplicateStretch,
  },
}
