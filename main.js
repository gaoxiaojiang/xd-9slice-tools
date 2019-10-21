// XD拡張APIのクラスをインポート
const {
  Artboard,
  Text,
  Color,
  ImageFill,
  Line,
  Rectangle,
} = require('scenegraph')
const scenegraph = require('scenegraph')
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

function get9sliceParamters(node) {
  var pattern = /-9slice=([0-9]+px)?[^0-9]?([0-9]+px)?[^0-9]?([0-9]+px)?[^0-9]?([0-9]+px)?[^0-9]?/
  var result = mode.name.match(pattern)
  /*
  省略については、CSSに準拠
  http://www.htmq.com/css3/border-image-slice.shtml
  上・右・下・左の端から内側へのオフセット量
  4番目の値が省略された場合には、2番目の値と同じ。
  3番目の値が省略された場合には、1番目の値と同じ。
  2番目の値が省略された場合には、1番目の値と同じ。
  */
  if (result[2] == null) {
    result[2] = result[1]
  }
  if (result[3] == null) {
    result[3] = result[1]
  }
  if (result[4] == null) {
    result[4] = result[1]
  }
  return result
}

function SetGlobalBounds(node, newGlobalBounds) {
  const globalBounds = node.globalDrawBounds
  const deltaX = newGlobalBounds.x - globalBounds.x
  const deltaY = newGlobalBounds.y - globalBounds.y
  node.moveInParentCoordinates(deltaX, deltaY)
  node.resize(newGlobalBounds.width, newGlobalBounds.height)
}

/**
 * スライスノード内のリサイズ
 * @param {*} mask
 * @param {*} graphicNode
 * @param {*} leftPx
 * @param {*} rightPx
 */
function scaleAdjustTop(
  globalBounds,
  mask,
  graphicNode,
  sliceLeftPx,
  sliceRightPx,
  sliceTopPx,
  sliceBottomPx,
) {
  console.log(graphicNode)
  var imageFill = graphicNode.fill
  if (imageFill == null || imageFill.constructor.name != 'ImageFill') {
    console.log('not ImageFill')
    return
  }
  var maskBounds = mask.globalDrawBounds
  var graphicBounds = graphicNode.globalDrawBounds
  console.log('mask wh:', maskBounds.width, maskBounds.height)
  console.log(
    'image natural wh:',
    imageFill.naturalWidth,
    imageFill.naturalHeight,
  )
  // SCALE_STRETHC(サイズに合わせて変形する)じゃないと、対応できない
  imageFill.scaleBehavior = ImageFill.SCALE_STRETCH
  if (imageFill.scaleBehavior != ImageFill.SCALE_STRETCH) {
    // SCALE_STRETCHにしたが、変更できなかった
    alert('fail to set SCALE_STRETCH')
  }

  var maskNaturalWidth = imageFill.naturalWidth - sliceRightPx - sliceLeftPx
  const maskWidth = globalBounds.width - sliceRightPx - sliceLeftPx
  const maskHeight = sliceTopPx
  var scale = maskWidth / maskNaturalWidth
  //console.log(scale)
  SetGlobalBounds(mask, {
    x: globalBounds.x + sliceLeftPx,
    y: globalBounds.y,
    width: maskWidth,
    height: maskHeight,
  })
  //graphicNode.translation = { x: -sliceRightPx * scale, y: 0 }
  graphicNode.resize(imageFill.naturalWidth * scale, imageFill.naturalHeight)
}

var selection = null
/**
 *
 * @param {SceneNode} sliceNode
 */
function scaleAdjustSlice(globalBounds, sliceNode) {
  var mask = sliceNode.mask
  if (!mask) {
    console.log('not found mask')
    return
  }

  var children = []
  sliceNode.children.forEach(child => {
    children.push(child)
  })

  var parent = sliceNode.parent
  selection.items = [sliceNode]
  commands.ungroup()

  var maskGroupItems = [mask]
  var image = children.forEach(child => {
    // スライスノード内のリサイズの必要なものを探す
    if (child == mask) return
    scaleAdjustTop(globalBounds, mask, child, 86, 86, 86, 86)
    maskGroupItems.push(child)
  })
  selection.items = maskGroupItems
  commands.createMaskGroup()
  var maskGroup = selection.items[0]
  maskGroup.name = 'top'
}

/**
 * 選択したノードを画像出力する
 * 画像出力のテスト用
 * @param {*} selection
 * @param {*} root
 */
async function pluginScaleAdjust(selectionArg, root) {
  selection = selectionArg
  var selectionItems = []
  selection.items.forEach(item => {
    selectionItems.push(item)
  })

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
    var bounds = item.parent.globalBounds
    scaleAdjustSlice(bounds, item)
    //scaleAdjustSlice(item.parent)
  })
}

module.exports = {
  // コマンドIDとファンクションの紐付け
  commands: {
    pluginScaleAdjust: pluginScaleAdjust,
  },
}
