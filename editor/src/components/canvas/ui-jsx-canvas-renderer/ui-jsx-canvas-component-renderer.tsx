import React from 'react'
import type { MapLike } from 'typescript'
import type {
  EarlyReturn,
  JSXElementChild,
  Param,
  UtopiaJSXComponent,
} from '../../../core/shared/element-template'
import {
  isUtopiaJSXComponent,
  isSVGElement,
  isJSXElement,
  propertiesExposedByParam,
  propertiesExposedByParams,
} from '../../../core/shared/element-template'
import { optionalMap } from '../../../core/shared/optional-utils'
import type {
  DomWalkerInvalidatePathsCtxData,
  UiJsxCanvasContextData,
  VariableData,
} from '../ui-jsx-canvas'
import {
  DomWalkerInvalidatePathsCtxAtom,
  UiJsxCanvasCtxAtom,
  ElementsToRerenderGLOBAL,
} from '../ui-jsx-canvas'
import type { MutableUtopiaCtxRefData } from './ui-jsx-canvas-contexts'
import { RerenderUtopiaCtxAtom, SceneLevelUtopiaCtxAtom } from './ui-jsx-canvas-contexts'
import { applyPropsParamToPassedProps } from './ui-jsx-canvas-props-utils'
import { runBlockUpdatingScope } from './ui-jsx-canvas-scope-utils'
import * as EP from '../../../core/shared/element-path'
import {
  createLookupRender,
  renderCoreElement,
  utopiaCanvasJSXLookup,
} from './ui-jsx-canvas-element-renderer-utils'
import type { ElementPath } from '../../../core/shared/project-file-types'
import { UTOPIA_INSTANCE_PATH, UTOPIA_PATH_KEY } from '../../../core/model/utopia-constants'
import { getPathsFromString, getUtopiaID } from '../../../core/shared/uid-utils'
import { useGetTopLevelElementsAndImports } from './ui-jsx-canvas-top-level-elements'
import { useGetCodeAndHighlightBounds } from './ui-jsx-canvas-execution-scope'
import { usePubSubAtomReadOnly } from '../../../core/shared/atom-with-pub-sub'
import {
  JSX_CANVAS_LOOKUP_FUNCTION_NAME,
  applyBlockReturnFunctions,
} from '../../../core/shared/dom-utils'
import { objectMap } from '../../../core/shared/object-utils'
import type { ComponentRendererComponent } from './component-renderer-component'
import { mapArrayToDictionary } from '../../../core/shared/array-utils'
import { assertNever } from '../../../core/shared/utils'
import { addFakeSpyEntry } from './ui-jsx-canvas-spy-wrapper'
import type { FilePathMappings } from '../../../core/model/project-file-utils'

function tryToGetInstancePath(
  maybePath: ElementPath | null,
  pathsString: string | null,
): ElementPath | null {
  const paths = getPathsFromString(pathsString)
  if (EP.isElementPath(maybePath)) {
    return maybePath
  } else if (paths.length > 0) {
    return paths[0]
  } else {
    return null
  }
}

export function createComponentRendererComponent(params: {
  topLevelElementName: string | null
  filePath: string
  mutableContextRef: React.MutableRefObject<MutableUtopiaCtxRefData>
}): ComponentRendererComponent {
  const Component = (...functionArguments: Array<any>) => {
    // Attempt to determine which function argument is the "regular" props object/value.
    // Default it to the first if one is not identified by looking for some of our special keys.
    let regularPropsArgumentIndex: number = functionArguments.findIndex((functionArgument) => {
      if (
        typeof functionArgument === 'object' &&
        functionArgument != null &&
        !Array.isArray(functionArgument)
      ) {
        return UTOPIA_INSTANCE_PATH in functionArgument || UTOPIA_PATH_KEY in functionArgument
      } else {
        return false
      }
    })
    if (regularPropsArgumentIndex < 0) {
      regularPropsArgumentIndex = 0
    }
    const {
      [UTOPIA_INSTANCE_PATH]: instancePathAny, // TODO types?
      [UTOPIA_PATH_KEY]: pathsString, // TODO types?
      ...realPassedProps
    } = functionArguments[regularPropsArgumentIndex]

    // We want to strip the instance path and path from the props that we pass to the component.
    let slightlyStrippedFunctionsArguments = [...functionArguments]
    slightlyStrippedFunctionsArguments[regularPropsArgumentIndex] = realPassedProps

    const mutableContext = params.mutableContextRef.current[params.filePath].mutableContext

    const instancePath: ElementPath | null = tryToGetInstancePath(instancePathAny, pathsString)

    function shouldUpdate() {
      return (
        ElementsToRerenderGLOBAL.current === 'rerender-all-elements' ||
        ElementsToRerenderGLOBAL.current.some((er) => {
          return (
            (instancePath != null &&
              (EP.pathsEqual(er, instancePath) || EP.isParentComponentOf(instancePath, er))) ||
            isElementInChildrenOrPropsTree(EP.toString(er), realPassedProps)
          )
        })
      )
    }

    const rerenderUtopiaContext = usePubSubAtomReadOnly(RerenderUtopiaCtxAtom, shouldUpdate)

    const { topLevelElements, imports } = useGetTopLevelElementsAndImports(
      params.filePath,
      shouldUpdate,
    )
    const { code, highlightBounds } = useGetCodeAndHighlightBounds(params.filePath, shouldUpdate)

    const utopiaJsxComponent: UtopiaJSXComponent | null =
      topLevelElements.find((elem): elem is UtopiaJSXComponent => {
        return isUtopiaJSXComponent(elem) && elem.name === params.topLevelElementName
      }) ?? null

    const shouldIncludeCanvasRootInTheSpy = rerenderUtopiaContext.shouldIncludeCanvasRootInTheSpy

    const hiddenInstances = rerenderUtopiaContext.hiddenInstances
    const displayNoneInstances = rerenderUtopiaContext.displayNoneInstances
    const sceneContext = usePubSubAtomReadOnly(SceneLevelUtopiaCtxAtom, shouldUpdate)

    let metadataContext: UiJsxCanvasContextData = usePubSubAtomReadOnly(
      UiJsxCanvasCtxAtom,
      shouldUpdate,
    )
    const updateInvalidatedPaths: DomWalkerInvalidatePathsCtxData = usePubSubAtomReadOnly(
      DomWalkerInvalidatePathsCtxAtom,
      shouldUpdate,
    )

    if (utopiaJsxComponent == null) {
      // If this element cannot be found, we want to purposefully cause a 'ReferenceError' to notify the user.
      throw new ReferenceError(`${params.topLevelElementName} is not defined`)
    }

    const rootElementPath = optionalMap(
      (path) => EP.appendNewElementPath(path, getUtopiaID(utopiaJsxComponent.rootElement)),
      instancePath,
    )

    // TODO we should throw an error if rootElementPath is null

    let codeError: Error | null = null

    const appliedProps = optionalMap(
      (param) =>
        applyPropsParamToPassedProps(
          mutableContext.rootScope,
          rootElementPath,
          slightlyStrippedFunctionsArguments,
          param,
          {
            requireResult: mutableContext.requireResult,
            rootScope: mutableContext.rootScope,
            parentComponentInputProps: realPassedProps,
            filePath: params.filePath,
            hiddenInstances: hiddenInstances,
            displayNoneInstances: displayNoneInstances,
            fileBlobs: mutableContext.fileBlobs,
            validPaths: sceneContext.validPaths,
            reactChildren: undefined,
            metadataContext: metadataContext,
            updateInvalidatedPaths: updateInvalidatedPaths,
            jsxFactoryFunctionName: mutableContext.jsxFactoryFunctionName,
            shouldIncludeCanvasRootInTheSpy: shouldIncludeCanvasRootInTheSpy,
            imports: imports,
            code: code,
            highlightBounds: highlightBounds,
            editedText: rerenderUtopiaContext.editedText,
            variablesInScope: mutableContext.spiedVariablesDeclaredInRootScope,
            filePathMappings: rerenderUtopiaContext.filePathMappings,
          },
          undefined,
          codeError,
        ),
      utopiaJsxComponent.params,
    ) ?? { props: realPassedProps }

    let scope: MapLike<any> = {
      ...mutableContext.rootScope,
      ...appliedProps,
    }

    let spiedVariablesInScope: VariableData = {
      ...mutableContext.spiedVariablesDeclaredInRootScope,
    }
    if (rootElementPath != null && utopiaJsxComponent.params != null) {
      for (const param of utopiaJsxComponent.params) {
        propertiesExposedByParam(param).forEach((paramName) => {
          spiedVariablesInScope[paramName] = {
            spiedValue: scope[paramName],
            insertionCeiling: rootElementPath,
          }
        })
      }
    }

    // Protect against infinite recursion by taking the view that anything
    // beyond a particular depth is going infinite or is likely
    // to be out of control otherwise.
    if (instancePath != null && EP.depth(instancePath) > 100) {
      throw new Error(`Element hierarchy is too deep, potentially has become infinite.`)
    }

    // either this updateInvalidatedPaths or the one in SpyWrapper is probably redundant
    if (shouldUpdate()) {
      updateInvalidatedPaths((invalidPaths) => {
        // Do not add `svg` elements that are the root element of a component.
        // As they will not be cleared by the DOM walker as they are not instances
        // of HTMLElement.
        const isSVGJSXElement =
          isJSXElement(utopiaJsxComponent.rootElement) &&
          isSVGElement(utopiaJsxComponent.rootElement.name)
        if (rootElementPath != null && !isSVGJSXElement) {
          return invalidPaths.add(EP.toString(rootElementPath))
        } else {
          return invalidPaths
        }
      })
    }

    const renderContextBase = {
      rootScope: scope,
      parentComponentInputProps: realPassedProps,
      requireResult: mutableContext.requireResult,
      hiddenInstances: hiddenInstances,
      displayNoneInstances: displayNoneInstances,
      fileBlobs: mutableContext.fileBlobs,
      validPaths: sceneContext.validPaths,
      reactChildren: undefined,
      metadataContext: metadataContext,
      updateInvalidatedPaths: updateInvalidatedPaths,
      jsxFactoryFunctionName: mutableContext.jsxFactoryFunctionName,
      shouldIncludeCanvasRootInTheSpy: shouldIncludeCanvasRootInTheSpy,
      filePath: params.filePath,
      imports: imports,
      code: code,
      highlightBounds: highlightBounds,
      editedText: rerenderUtopiaContext.editedText,
      filePathMappings: rerenderUtopiaContext.filePathMappings,
    }

    const buildResult = React.useRef<React.ReactElement | null>(null)

    let earlyReturn: EarlyReturn | null = null
    if (utopiaJsxComponent.arbitraryJSBlock != null) {
      const propertiesFromParams = propertiesExposedByParams(
        utopiaJsxComponent.arbitraryJSBlock.params,
      )
      const lookupRenderer = createLookupRender(
        rootElementPath,
        {
          ...renderContextBase,
          variablesInScope: {},
        },
        null,
        propertiesFromParams,
        null,
      )

      scope[JSX_CANVAS_LOOKUP_FUNCTION_NAME] = utopiaCanvasJSXLookup(
        utopiaJsxComponent.arbitraryJSBlock.elementsWithin,
        scope,
        lookupRenderer,
      )
      applyBlockReturnFunctions(scope)

      const arbitraryBlockResult = runBlockUpdatingScope(
        rootElementPath,
        params.filePath,
        mutableContext.requireResult,
        utopiaJsxComponent.arbitraryJSBlock,
        scope,
      )

      switch (arbitraryBlockResult.type) {
        case 'ARBITRARY_BLOCK_RAN_TO_END':
          if (rootElementPath != null) {
            spiedVariablesInScope = {
              ...spiedVariablesInScope,
              ...arbitraryBlockResult.spiedVariablesDeclaredWithinBlock,
              ...objectMap(
                (spiedValue) => ({
                  spiedValue: spiedValue,
                  insertionCeiling: rootElementPath,
                }),
                arbitraryBlockResult.scope,
              ),
            }
          }
          break
        case 'EARLY_RETURN_VOID':
          earlyReturn = arbitraryBlockResult
          buildResult.current = undefined as any
          break
        case 'EARLY_RETURN_RESULT':
          earlyReturn = arbitraryBlockResult
          buildResult.current = arbitraryBlockResult.result as any
          break
        default:
          assertNever(arbitraryBlockResult)
      }
    }

    function buildComponentRenderResult(element: JSXElementChild): React.ReactElement {
      const ownElementPath = optionalMap(
        (path) => EP.appendNewElementPath(path, getUtopiaID(element)),
        instancePath,
      )

      const renderedCoreElement = renderCoreElement(
        element,
        ownElementPath,
        scope,
        {
          ...renderContextBase,
          variablesInScope: spiedVariablesInScope,
        },
        realPassedProps['data-uid'],
        codeError,
        null,
      )

      if (typeof renderedCoreElement === 'string' || typeof renderedCoreElement === 'number') {
        return <>{renderedCoreElement}</>
      } else {
        return renderedCoreElement
      }
    }

    if (earlyReturn != null) {
      if (instancePath != null) {
        addFakeSpyEntry(
          sceneContext.validPaths,
          metadataContext,
          instancePath,
          utopiaJsxComponent.rootElement,
          params.filePath,
          imports,
          'not-a-conditional',
          earlyReturn,
          null,
        )
      }
    } else if (shouldUpdate()) {
      buildResult.current = buildComponentRenderResult(utopiaJsxComponent.rootElement)
    }
    return buildResult.current
  }
  Component.displayName = `ComponentRenderer(${params.topLevelElementName})`
  Component.topLevelElementName = params.topLevelElementName
  Component.utopiaType = 'UTOPIA_COMPONENT_RENDERER_COMPONENT' as const
  Component.filePath = params.filePath
  Component.originalName = params.topLevelElementName
  return Component
}

function isRenderProp(prop: any): prop is { props: { [UTOPIA_PATH_KEY]: string } } {
  return (
    prop != null &&
    typeof prop === 'object' &&
    prop.props != null &&
    typeof prop.props === 'object' &&
    typeof prop.props[UTOPIA_PATH_KEY] === 'string'
  )
}

function isElementInChildrenOrPropsTree(elementPath: string, props: any): boolean {
  const childrenArr = React.Children.toArray(props.children).filter(React.isValidElement)
  const elementIsChild = childrenArr.some((c) => (c.props as any)[UTOPIA_PATH_KEY] === elementPath)
  if (elementIsChild) {
    return true
  }

  const elementsInProps = Object.values(props).filter(isRenderProp)
  const isElementInProps = elementsInProps.some((p) => p.props[UTOPIA_PATH_KEY] === elementPath)
  if (isElementInProps) {
    return true
  }

  return (
    childrenArr.some((c) => isElementInChildrenOrPropsTree(elementPath, c.props)) ||
    elementsInProps.some((p) => isElementInChildrenOrPropsTree(elementPath, p.props))
  )
}
