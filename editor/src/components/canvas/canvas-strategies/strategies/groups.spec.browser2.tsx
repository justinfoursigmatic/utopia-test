/* eslint jest/expect-expect: ["warn", { "assertFunctionNames": ["expect", "assertStylePropsSet"] }] */
import { getSimpleAttributeAtPath } from '../../../../core/model/element-metadata-utils'
import { BakedInStoryboardUID } from '../../../../core/model/scene-utils'
import { getDomRectCenter } from '../../../../core/shared/dom-utils'
import { defaultEither } from '../../../../core/shared/either'
import { forceRight } from '../../../../core/shared/either'
import { right } from '../../../../core/shared/either'
import { foldEither } from '../../../../core/shared/either'
import { mapEither } from '../../../../core/shared/either'
import { fromString } from '../../../../core/shared/element-path'
import { forceNotNull } from '../../../../core/shared/optional-utils'
import { create } from '../../../../core/shared/property-path'
import { NO_OP } from '../../../../core/shared/utils'
import { Modifiers, emptyModifiers } from '../../../../utils/modifiers'
import { selectComponentsForTest, wait } from '../../../../utils/utils.test-utils'
import { EdgePositionBottomRight } from '../../canvas-types'
import { CanvasControlsContainerID } from '../../controls/new-canvas-controls'
import { mouseDragFromPointWithDelta } from '../../event-helpers.test-utils'
import { EditorRenderResult, TestAppUID } from '../../ui-jsx.test-utils'
import { TestSceneUID } from '../../ui-jsx.test-utils'
import { makeTestProjectCodeWithSnippet, renderTestEditorWithCode } from '../../ui-jsx.test-utils'
import { resizeElement } from './absolute-resize.test-utils'

const GroupPath = `${BakedInStoryboardUID}/${TestSceneUID}/${TestAppUID}:root-div/group`

function makeCodeSnippetForGroups(code: string) {
  return `
  <div data-uid='root-div' style={{width: 400, height: 400, position: 'relative'}}>
    ${code}
  </div>
`
}

async function renderProjectWithGroup(code: string) {
  const editor = await renderTestEditorWithCode(
    makeTestProjectCodeWithSnippet(makeCodeSnippetForGroups(code)),
    'await-first-dom-report',
  )

  return editor
}

async function dragByPixels(
  editor: EditorRenderResult,
  delta: { x: number; y: number },
  testid: string,
  modifiers: Modifiers = emptyModifiers,
) {
  const targetElement = editor.renderedDOM.getByTestId(testid)
  const targetElementBounds = targetElement.getBoundingClientRect()
  const targetElementCenter = getDomRectCenter(targetElementBounds)
  const canvasControlsLayer = editor.renderedDOM.getByTestId(CanvasControlsContainerID)

  await mouseDragFromPointWithDelta(canvasControlsLayer, targetElementCenter, delta, {
    modifiers,
    midDragCallback: async () => {
      NO_OP()
    },
  })
}

function assertStylePropsSet(
  editor: EditorRenderResult,
  elementPathStr: string,
  stylePropsObjToMatch: Record<string, any>,
) {
  const foundElement = forceNotNull(
    `couldn't find element ${elementPathStr}`,
    foldEither(
      () => null,
      (element) => (element.type === 'JSX_ELEMENT' ? element : null),
      editor.getEditorState().editor.jsxMetadata[elementPathStr].element,
    ),
  )

  for (const key in stylePropsObjToMatch) {
    const expectedValue = stylePropsObjToMatch[key]
    const actualValue = forceRight(
      getSimpleAttributeAtPath(right(foundElement.props), create('style', key)),
      `couldn't find style prop ${key}`,
    )
    if (actualValue !== expectedValue) {
      throw new Error(
        `assertStylePropsSet equality

props.style.${key} on element ${elementPathStr}:

Expected: ${JSON.stringify(expectedValue)}
Received: ${JSON.stringify(actualValue)}`,
      )
    }
    expect(actualValue).toEqual(expectedValue)
  }
}

describe('Groups behaviors', () => {
  describe('Absolute Positioned Groups', () => {
    describe('Various Group Configurations', () => {
      it('single child with top,left,width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('100px')
        expect(groupDiv.style.height).toBe('100px')
      })

      it('multiple children with top,left,width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 100,
                left: 100,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })

      it('nothing wrong with this group!', async () => {
        const editor = await renderProjectWithGroup(`
          <Group
            data-testid='group'
            style={{
              backgroundColor: '#d3d3d3',
              contain: 'layout',
            }}
          >
            <View
              style={{
                backgroundColor: '#E80000',
                position: 'absolute',
                left: 0.5,
                top: 0,
                width: 50,
                height: 50,
              }}
              data-uid='dea'
            />
            <View
              style={{
                backgroundColor: '#FF0000',
                position: 'absolute',
                left: 248,
                top: 167,
                width: 150,
                height: 50,
              }}
              data-uid='c0f'
            />
            <View
              style={{
                backgroundColor: '#FF0000',
                position: 'absolute',
                left: 150,
                top: 12,
                width: 150,
                height: 50,
              }}
              data-uid='909'
            />
            <View
              style={{
                backgroundColor: '#FF0000',
                position: 'absolute',
                left: 0,
                top: 210,
                width: 150,
                height: 50,
              }}
              data-uid='e2f'
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('398px')
        expect(groupDiv.style.height).toBe('260px')
      })

      it('group pinned right,bottom  withmultiple children with top,left,width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', right: 50, bottom: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 100,
                left: 100,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })

      it('single child with OFFSET top,left,width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 50,
                left: 50,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('150px')
        expect(groupDiv.style.height).toBe('150px')
      })

      it('children with bottom,right,width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 100,
                bottom: 100,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })

      it('child with top,left,bottom,right pins, no width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div
              data-testid='child'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 50,
                left: 50,
                right: 100,
                bottom: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')
        expect(groupDiv.style.width).toBe('150px')
        expect(groupDiv.style.height).toBe('150px')

        const childDiv = editor.renderedDOM.getByTestId('child')
        // notice that the child ends up with zero width and height because it was set to auto
        expect(childDiv.getBoundingClientRect().width).toBe(0)
        expect(childDiv.getBoundingClientRect().height).toBe(0)
      })

      it('child with top,left,bottom,right, width, height (!!!!!!) pins', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 50,
                left: 50,
                right: 100,
                bottom: 100,
                width: 50,
                height: 50,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })

      it('children with nested Fragments', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <>
              <div 
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  top: 100,
                  left: 100,
                  width: 100,
                  height: 100,
                }}
              />
            </>
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })
      it('children with nested Groups', async () => {
        const editor = await renderProjectWithGroup(`
        <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
          <div 
            style={{
              backgroundColor: 'red',
              position: 'absolute',
              top: 0,
              left: 0,
              width: 100,
              height: 100,
            }}
          />
          <Group style={{position: 'absolute', left: 100, top: 100}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        </Group>
      `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })
      it('nested group with bottom,right,width,height pins', async () => {
        const editor = await renderProjectWithGroup(`
        <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
          <div 
            style={{
              backgroundColor: 'red',
              position: 'absolute',
              bottom: 100,
              right: 100,
              width: 100,
              height: 100,
            }}
          />
          <Group style={{position: 'absolute', bottom: 0, right: 0}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        </Group>
      `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')
      })

      it('nested group with top,left,right,bottom pins', async () => {
        const editor = await renderProjectWithGroup(`
            <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
              <div 
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 100,
                  height: 100,
                }}
              />
              <Group 
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  top: 100,
                  left: 100,
                  right: 50,
                  bottom: 50,
                }}
              >
                <div 
                  style={{
                    backgroundColor: 'red',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 100,
                    height: 100,
                  }}
                />
              </Group>
            </Group>
          `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('250px')
        expect(groupDiv.style.height).toBe('250px')
      })

      it('IGNORED: Any percentage pins are treated as zero', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 100,
                left: 100,
                width: '50%',
                height: '50%',
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('100px')
        expect(groupDiv.style.height).toBe('100px')
      })

      it('IGNORED: group with static child', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div 
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              style={{
                backgroundColor: 'red',
                // position: 'absolute', // this is static!
                top: 100,
                left: 100,
                width: 100,
                height: 100,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('100px')
        expect(groupDiv.style.height).toBe('100px')
      })
    })

    describe('Moving one Child', () => {
      it('moving a child inside the group move the child and offsets the group and all group children so they stay within the bounds', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-2`)])

        await dragByPixels(editor, { x: 100, y: 100 }, 'child-2')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 50,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 0,
          right: 100,
          width: 25,
          height: 25,
        })
      })

      it('moving a child inside a right,bottom pinned group move the child and offsets the group and all group children so they stay within the bounds', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', right: 150, bottom: 150}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-2`)])

        await dragByPixels(editor, { x: 100, y: 100 }, 'child-2')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          right: 50,
          bottom: 50,
          width: 300,
          height: 300,
          left: undefined,
          top: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 0,
          right: 100,
          width: 25,
          height: 25,
        })
      })

      it('moving a child inside a group without pins move the child and offsets the group and all group children so they stay within the bounds', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{ position: 'absolute' }}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-2`)])

        await dragByPixels(editor, { x: 100, y: 100 }, 'child-2')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          width: 300,
          height: 300,
          left: undefined,
          top: undefined,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 0,
          right: 100,
          width: 25,
          height: 25,
        })
      })

      it('moving a child to expand top-left', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', left: 150, top: 150}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-1`)])

        await dragByPixels(editor, { x: -100, y: -100 }, 'child-1')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 50,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 100,
          right: 0,
          width: 25,
          height: 25,
        })
      })

      it('moving a child in a right,bottom group to expand top-left', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', right: 50, bottom: 50}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-1`)])

        await dragByPixels(editor, { x: -100, y: -100 }, 'child-1')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          right: 50,
          bottom: 50,
          width: 300,
          height: 300,
          left: undefined,
          top: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 100,
          right: 0,
          width: 25,
          height: 25,
        })
      })

      it('moving a top-right pinned child to expand top-right', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', left: 25, top: 150}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-3`)])

        await dragByPixels(editor, { x: 100, y: -100 }, 'child-3')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 25,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 100,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 150,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 0,
          right: 0,
          width: 25,
          height: 25,
        })
      })

      it('group with width/height prop gets updated in the editor', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group'
            data-testid='group' 
            style={{
              position: 'absolute', 
              left: 50,
              top: 50,
              width: 200,
              height: 200,
            }}
          >
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-2`)])

        await dragByPixels(editor, { x: 100, y: 100 }, 'child-2')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 50,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 0,
          right: 100,
          width: 25,
          height: 25,
        })
      })

      it('children offset behavior works with nested Fragments', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', left: 150, top: 150}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <React.Fragment data-uid='fragment'>
              <div 
                data-uid='child-2'
                data-testid='child-2'
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  top: 150,
                  left: 150,
                  width: 50,
                  height: 50,
                }}
              />
              <div 
                data-uid='child-3'
                data-testid='child-3'
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  width: 25,
                  height: 25,
                }}
              />
              </React.Fragment>
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-1`)])

        await dragByPixels(editor, { x: -100, y: -100 }, 'child-1')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 50,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/fragment/child-2`, {
          left: 250,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/fragment/child-3`, {
          top: 100,
          right: 0,
          width: 25,
          height: 25,
        })
      })

      it('works with nested Groups', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', left: 50, top: 50}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <Group data-uid='inner-group' data-testid='inner-group' style={{position: 'absolute', left: 150, top: 0}}>
              <div 
                data-uid='child-2'
                data-testid='child-2'
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  top: 150,
                  left: 0,
                  width: 50,
                  height: 50,
                }}
              />
              <div 
                data-uid='child-3'
                data-testid='child-3'
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  width: 25,
                  height: 25,
                }}
              />
              </Group>
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        const innerGroupDiv = editor.renderedDOM.getByTestId('inner-group')

        expect(innerGroupDiv.style.width).toBe('50px')
        expect(innerGroupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/inner-group/child-2`)])

        await dragByPixels(editor, { x: 100, y: 100 }, 'child-2')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        expect(innerGroupDiv.style.width).toBe('125px')
        expect(innerGroupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 50,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/inner-group`, {
          left: 175,
          top: 0,
          width: 125,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/inner-group/child-2`, {
          left: 75,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/inner-group/child-3`, {
          top: 0,
          right: 100,
          width: 25,
          height: 25,
        })
      })

      it('works with nested Groups that have explicit size', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' style={{position: 'absolute', left: 50, top: 50, width: 200, height: 200}}>
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <Group data-uid='inner-group' data-testid='inner-group' style={{position: 'absolute', left: 150, top: 0, width: 50, height: 200}}>
              <div 
                data-uid='child-2'
                data-testid='child-2'
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  top: 150,
                  left: 0,
                  width: 50,
                  height: 50,
                }}
              />
              <div 
                data-uid='child-3'
                data-testid='child-3'
                style={{
                  backgroundColor: 'red',
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  width: 25,
                  height: 25,
                }}
              />
              </Group>
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        const innerGroupDiv = editor.renderedDOM.getByTestId('inner-group')

        expect(innerGroupDiv.style.width).toBe('50px')
        expect(innerGroupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/inner-group/child-2`)])

        await dragByPixels(editor, { x: 100, y: 100 }, 'child-2')

        expect(groupDiv.style.width).toBe('300px')
        expect(groupDiv.style.height).toBe('300px')

        expect(innerGroupDiv.style.width).toBe('125px')
        expect(innerGroupDiv.style.height).toBe('300px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 50,
          top: 50,
          width: 300,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/inner-group`, {
          left: 175,
          top: 0,
          width: 125,
          height: 300,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/inner-group/child-2`, {
          left: 75,
          top: 250,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/inner-group/child-3`, {
          top: 0,
          right: 100,
          width: 25,
          height: 25,
        })
      })

      it('an accidental static child disables all Group-like features', async () => {
        const editor = await renderProjectWithGroup(`
          <Group data-uid='group' data-testid='group' 
            style={{
              position: 'absolute', 
              left: 150, 
              top: 150, 
              width: 200, 
              height: 200
            }}
          >
            <div
              data-uid='child-1'
              data-testid='child-1'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 100,
                height: 100,
              }}
            />
            <div 
              data-uid='child-2'
              data-testid='child-2'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                top: 150,
                left: 150,
                width: 50,
                height: 50,
              }}
            />
            <div 
              data-uid='child-3'
              data-testid='child-3'
              style={{
                backgroundColor: 'red',
                position: 'absolute',
                right: 0,
                top: 0,
                width: 25,
                height: 25,
              }}
            />
            <div 
              data-uid='static-child'
              data-testid='static-child'
              style={{
                backgroundColor: 'red',
                width: 25,
                height: 25,
              }}
            />
          </Group>
        `)
        const groupDiv = editor.renderedDOM.getByTestId('group')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        await selectComponentsForTest(editor, [fromString(`${GroupPath}/child-1`)])

        await dragByPixels(editor, { x: -45, y: -45 }, 'child-1')

        expect(groupDiv.style.width).toBe('200px')
        expect(groupDiv.style.height).toBe('200px')

        assertStylePropsSet(editor, `${GroupPath}`, {
          left: 150,
          top: 150,
          width: 200,
          height: 200,
          right: undefined,
          bottom: undefined,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-1`, {
          left: -45,
          top: -45,
          width: 100,
          height: 100,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-2`, {
          left: 150,
          top: 150,
          width: 50,
          height: 50,
        })
        assertStylePropsSet(editor, `${GroupPath}/child-3`, {
          top: 0,
          right: 0,
          width: 25,
          height: 25,
        })
      })
    })
  })
})
