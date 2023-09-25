import React from 'react'
import {
  FlexColumn,
  FlexRow,
  Icons,
  ModalityIcons,
  useColorTheme,
  UtopiaStyles,
  UtopiaTheme,
} from '../../../../uuiui'
import { Substores, useEditorState } from '../../../editor/store/store-hook'
import type { DragToMoveIndicatorFlags } from '../../../editor/store/editor-state'

export function useGetDragStrategyIndicatorFlags(): {
  indicatorFlags: DragToMoveIndicatorFlags
  dragStarted: boolean
} | null {
  return useEditorState(
    Substores.canvas,
    (store) => {
      if (store.editor.canvas.interactionSession?.interactionData.type === 'DRAG') {
        return {
          indicatorFlags: store.editor.canvas.controls.dragToMoveIndicatorFlags,
          dragStarted: store.editor.canvas.interactionSession?.interactionData.drag != null,
        }
      } else {
        return null
      }
    },
    'useGetStrategyIndicatorFlags',
  )
}

const StrategyIndicatorWidth = 240
export const StrategyIndicator = React.memo(() => {
  const colorTheme = useColorTheme()
  const indicatorFlagsInfo = useGetDragStrategyIndicatorFlags()

  if (indicatorFlagsInfo == null) {
    // return null
  }

  return (
    <FlexRow
      style={{
        marginLeft: 15,
        padding: '0 8px',
        height: 32,
        gap: 10,
        overflow: 'hidden',
        backgroundColor: colorTheme.bg2.value,
        borderRadius: '0px 10px 10px 10px',
        boxShadow: UtopiaTheme.panelStyles.shadows.medium,
        pointerEvents: 'initial',
        zIndex: -1,
      }}
      data-testid='drag-strategy-indicator'
    >
      <MoveReorderReparentIndicator
        dragType={indicatorFlagsInfo?.indicatorFlags.dragType ?? 'none'}
        reparentStatus={indicatorFlagsInfo?.indicatorFlags.reparent ?? 'none'}
      />
      <AncestorIndicatorItem enabled={indicatorFlagsInfo?.indicatorFlags.ancestor ?? false} />
    </FlexRow>
  )
})

interface MoveIndicatorItemProps {
  dragType: DragToMoveIndicatorFlags['dragType']
  reparentStatus: DragToMoveIndicatorFlags['reparent']
}

const MoveReorderReparentIndicator = React.memo<MoveIndicatorItemProps>((props) => {
  const colorTheme = useColorTheme()
  return (
    <FlexRow
      style={{
        height: 32,
        color: colorTheme.primary.value,
        minWidth: 110,
      }}
    >
      <Icons.Checkmark color='primary' />
      {(() => {
        if (props.reparentStatus !== 'none') {
          if (props.dragType === 'absolute') {
            return 'Absolute Reparent'
          } else {
            return 'Reparent'
          }
        }
        if (props.dragType === 'absolute') {
          return 'Absolute Move'
        }
        if (props.dragType === 'static') {
          return 'Reorder'
        }
        return 'Interaction'
      })()}
    </FlexRow>
  )
})

interface IndicatorItemProps {
  enabled: boolean
}
const AncestorIndicatorItem = React.memo<IndicatorItemProps>((props) => {
  return (
    <FlexRow style={{ alignItems: 'center', paddingRight: 8 }}>
      <div
        style={{
          padding: 7,
        }}
      >
        <VisibilityWrapper visible={props.enabled}>
          <ModalityIcons.Magic color={'main'} />
        </VisibilityWrapper>
      </div>
    </FlexRow>
  )
})

interface VisibilityWrapperProps {
  visible: boolean
}
const VisibilityWrapper = React.memo<React.PropsWithChildren<VisibilityWrapperProps>>((props) => {
  return (
    <div style={{ opacity: props.visible ? 1 : 0, height: props.visible ? undefined : 0 }}>
      {props.children}
    </div>
  )
})
