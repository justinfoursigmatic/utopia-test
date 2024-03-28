import type {
  RegularControlDescription as RegularControlDescriptionFromUtopia,
  JSXControlDescription as JSXControlDescriptionFromUtopia,
  PropertyControls as PropertyControlsFromUtopiaAPI,
  ComponentToRegister,
  ComponentInsertOption,
  PreferredChildComponent,
} from 'utopia-api/core'
import { isBaseControlDescription } from 'utopia-api/core'
import type {
  ObjectControlDescription,
  PropertyControls,
  RegularControlDescription,
  JSXControlDescription,
  PreferredChildComponentDescriptor,
} from '../../components/custom-code/internal-property-controls'
import { packageJsonFileFromProjectContents } from '../../components/assets'
import {
  componentDescriptorFromDescriptorFile,
  isDefaultComponentDescriptor,
} from '../../components/custom-code/code-file'
import type {
  ComponentDescriptorSource,
  ComponentDescriptorWithName,
  ComponentInfo,
  PropertyControlsInfo,
} from '../../components/custom-code/code-file'
import { dependenciesFromPackageJson } from '../../components/editor/npm-dependency/npm-dependency'
import { parseControlDescription } from './property-controls-parser'
import type { ParseError, ParseResult } from '../../utils/value-parser-utils'
import {
  getParseErrorDetails,
  objectKeyParser,
  optionalObjectKeyParser,
  parseAny,
  parseArray,
  parseBoolean,
  parseObject,
  parseString,
} from '../../utils/value-parser-utils'
import type { ParseOrPrintResult, UtopiaTsWorkers } from '../workers/common/worker-types'
import { getCachedParseResultForUserStrings } from './property-controls-local-parser-bridge'
import type { Either } from '../shared/either'
import {
  applicative3Either,
  applicative4Either,
  applicative5Either,
  foldEither,
  forEachRight,
  isLeft,
  left,
  mapEither,
  right,
  sequenceEither,
} from '../shared/either'
import { setOptionalProp } from '../shared/object-utils'
import { assertNever } from '../shared/utils'
import type { ParsedTextFile } from '../shared/project-file-types'
import { isExportDefault, isParseSuccess } from '../shared/project-file-types'
import type { UiJsxCanvasContextData } from '../../components/canvas/ui-jsx-canvas'
import type { EditorState } from '../../components/editor/store/editor-state'
import type { MutableUtopiaCtxRefData } from '../../components/canvas/ui-jsx-canvas-renderer/ui-jsx-canvas-contexts'
import {
  isComponentRendererComponent,
  type ComponentRendererComponent,
} from '../../components/canvas/ui-jsx-canvas-renderer/component-renderer-component'
import type { MapLike } from 'typescript'
import { attemptToResolveParsedComponents } from '../../components/canvas/ui-jsx-canvas'
import { NO_OP } from '../shared/utils'
import { createExecutionScope } from '../../components/canvas/ui-jsx-canvas-renderer/ui-jsx-canvas-execution-scope'
import type { EditorDispatch } from '../../components/editor/action-types'
import {
  setCodeEditorLintErrors,
  updatePropertyControlsInfo,
} from '../../components/editor/actions/action-creators'
import type { ProjectContentTreeRoot } from '../../components/assets'
import { isIntrinsicHTMLElement } from '../shared/element-template'
import type { ErrorMessage } from '../shared/error-messages'
import { errorMessage } from '../shared/error-messages'

async function parseInsertOption(
  insertOption: ComponentInsertOption,
  componentName: string,
  moduleName: string,
  workers: UtopiaTsWorkers,
): Promise<Either<string, ComponentInfo>> {
  const allRequiredImports = `import { ${componentName} } from '${moduleName}'; ${
    insertOption.additionalImports ?? ''
  }`

  const parsedParams = await getCachedParseResultForUserStrings(
    workers,
    allRequiredImports,
    insertOption.code,
  )

  return mapEither(({ importsToAdd, elementToInsert }) => {
    return {
      insertMenuLabel: insertOption.label ?? componentName,
      elementToInsert: () => elementToInsert,
      importsToAdd: importsToAdd,
    }
  }, parsedParams)
}

export type ModuleEvaluator = (moduleName: string) => any
export function createModuleEvaluator(editor: EditorState): ModuleEvaluator {
  return (moduleName: string) => {
    let mutableContextRef: { current: MutableUtopiaCtxRefData } = { current: {} }
    let topLevelComponentRendererComponents: {
      current: MapLike<MapLike<ComponentRendererComponent>>
    } = { current: {} }
    const emptyMetadataContext: UiJsxCanvasContextData = {
      current: { spyValues: { allElementProps: {}, metadata: {}, variablesInScope: {} } },
    }

    let resolvedFiles: MapLike<MapLike<any>> = {}
    let resolvedFileNames: Array<string> = [moduleName]

    const requireFn = editor.codeResultCache.curriedRequireFn(editor.projectContents)
    const resolve = editor.codeResultCache.curriedResolveFn(editor.projectContents)

    const customRequire = (importOrigin: string, toImport: string) => {
      if (resolvedFiles[importOrigin] == null) {
        resolvedFiles[importOrigin] = []
      }
      let resolvedFromThisOrigin = resolvedFiles[importOrigin]

      const alreadyResolved = resolvedFromThisOrigin[toImport] !== undefined
      const filePathResolveResult = alreadyResolved
        ? left<string, string>('Already resolved')
        : resolve(importOrigin, toImport)

      forEachRight(filePathResolveResult, (filepath) => resolvedFileNames.push(filepath))

      const resolvedParseSuccess: Either<string, MapLike<any>> = attemptToResolveParsedComponents(
        resolvedFromThisOrigin,
        toImport,
        editor.projectContents,
        customRequire,
        mutableContextRef,
        topLevelComponentRendererComponents,
        moduleName,
        editor.canvas.base64Blobs,
        editor.hiddenInstances,
        editor.displayNoneInstances,
        emptyMetadataContext,
        NO_OP,
        false,
        filePathResolveResult,
        null,
      )
      return foldEither(
        () => {
          // We did not find a ParseSuccess, fallback to standard require Fn
          return requireFn(importOrigin, toImport, false)
        },
        (scope) => {
          // Return an artificial exports object that contains our ComponentRendererComponents
          return scope
        },
        resolvedParseSuccess,
      )
    }
    return createExecutionScope(
      moduleName,
      customRequire,
      mutableContextRef,
      topLevelComponentRendererComponents,
      editor.projectContents,
      moduleName,
      editor.canvas.base64Blobs,
      editor.hiddenInstances,
      editor.displayNoneInstances,
      emptyMetadataContext,
      NO_OP,
      false,
      null,
    ).scope
  }
}

// TODO: find a better way to detect component descriptor files, e.g. package.json
export const isComponentDescriptorFile = (filename: string) =>
  filename.startsWith('/utopia/') && filename.endsWith('.utopia.js')

type ComponentRegistrationValidationError =
  | { type: 'component-undefined'; registrationKey: string }
  | { type: 'component-name-does-not-match'; componentName: string; registrationKey: string }

function messageForComponentRegistrationValidationError(
  error: ComponentRegistrationValidationError,
): string {
  switch (error.type) {
    case 'component-name-does-not-match':
      return `Component name (${error.componentName}) does not match the registration key (${error.registrationKey})`
    case 'component-undefined':
      return `Component registered for key '${error.registrationKey}' is undefined`
    default:
      assertNever(error)
  }
}

type ComponentRegistrationValidationResult =
  | { type: 'valid' }
  | ComponentRegistrationValidationError

type ComponentDescriptorRegistrationError =
  | { type: 'file-unparsed' }
  | { type: 'file-parse-failure'; parseErrorMessages: ErrorMessage[] }
  | { type: 'no-export-default' }
  | { type: 'no-exported-component-descriptors' }
  | { type: 'evaluation-error'; evaluationError: unknown }
  | { type: 'invalid-schema'; invalidSchemaError: ParseError }
  | { type: 'cannot-extract-component'; componentExtractionError: string }
  | {
      type: 'registration-validation-failed'
      validationError: ComponentRegistrationValidationError
    }

interface ComponentDescriptorRegistrationResult {
  descriptors: ComponentDescriptorWithName[]
  errors: ComponentDescriptorRegistrationError[]
}

function isComponentRegistrationValid(
  registrationKey: string,
  registration: ComponentToRegister,
): ComponentRegistrationValidationResult {
  if (typeof registration.component === 'undefined') {
    return { type: 'component-undefined', registrationKey: registrationKey }
  }

  if (
    isComponentRendererComponent(registration.component) &&
    registration.component.originalName !== registrationKey
  ) {
    return {
      type: 'component-name-does-not-match',
      registrationKey: registrationKey,
      componentName: registration.component.originalName ?? 'null',
    }
  }

  return { type: 'valid' }
}

async function getComponentDescriptorPromisesFromParseResult(
  descriptorFile: ParsedTextFileWithPath,
  workers: UtopiaTsWorkers,
  evaluator: ModuleEvaluator,
): Promise<ComponentDescriptorRegistrationResult> {
  if (descriptorFile.file.type === 'UNPARSED') {
    return { descriptors: [], errors: [{ type: 'file-unparsed' }] }
  }

  if (descriptorFile.file.type === 'PARSE_FAILURE') {
    return {
      descriptors: [],
      errors: [
        { type: 'file-parse-failure', parseErrorMessages: descriptorFile.file.errorMessages },
      ],
    }
  }

  const exportDefaultIdentifier = descriptorFile.file.exportsDetail.find(isExportDefault)
  if (exportDefaultIdentifier?.name == null) {
    return { descriptors: [], errors: [{ type: 'no-export-default' }] }
  }

  try {
    const evaluatedFile = evaluator(descriptorFile.path)

    const descriptors = evaluatedFile[exportDefaultIdentifier.name]

    if (descriptors == null) {
      return { descriptors: [], errors: [{ type: 'no-exported-component-descriptors' }] }
    }

    let result: ComponentDescriptorWithName[] = []
    let errors: ComponentDescriptorRegistrationError[] = []

    for await (const [moduleName, descriptor] of Object.entries(descriptors)) {
      const parsedComponents = parseComponents(descriptor)

      if (parsedComponents.type === 'LEFT') {
        errors.push({ type: 'invalid-schema', invalidSchemaError: parsedComponents.value })
        continue
      }

      for await (const [componentName, componentToRegister] of Object.entries(
        parsedComponents.value,
      )) {
        const validationResult = isComponentRegistrationValid(componentName, componentToRegister)
        if (validationResult.type !== 'valid') {
          errors.push({ type: 'registration-validation-failed', validationError: validationResult })
          continue
        }
        const componentDescriptor = await componentDescriptorForComponentToRegister(
          componentToRegister,
          componentName,
          moduleName,
          workers,
          componentDescriptorFromDescriptorFile(descriptorFile.path),
        )

        switch (componentDescriptor.type) {
          case 'LEFT':
            errors.push({
              type: 'cannot-extract-component',
              componentExtractionError: componentDescriptor.value,
            })
            break
          case 'RIGHT':
            result = result.concat(componentDescriptor.value)
            break
          default:
            assertNever(componentDescriptor)
        }
      }
    }
    return { descriptors: result, errors: errors }
  } catch (e) {
    return { descriptors: [], errors: [{ type: 'evaluation-error', evaluationError: e }] }
  }
}

function simpleErrorMessage(fileName: string, error: string): ErrorMessage {
  return errorMessage(fileName, null, null, null, null, '', 'fatal', '', error, '', 'eslint', null)
}

function errorsFromComponentRegistration(
  fileName: string,
  errors: ComponentDescriptorRegistrationError[],
): ErrorMessage[] {
  return errors.flatMap((error) => {
    switch (error.type) {
      case 'file-unparsed':
        // we control whether a file is parsed or not, so this failure mode is not surfaced to users
        return []
      case 'file-parse-failure':
        return error.parseErrorMessages
      case 'evaluation-error':
        return [
          simpleErrorMessage(
            fileName,
            `Components file evaluation error: ${JSON.stringify(error.evaluationError)}`,
          ),
        ]
      case 'no-export-default':
        return [simpleErrorMessage(fileName, `Components file has no default export`)]
      case 'no-exported-component-descriptors':
        return [simpleErrorMessage(fileName, `Cannot extract default export from file`)]
      case 'invalid-schema':
        return [
          simpleErrorMessage(
            fileName,
            `Malformed component registration: ${
              getParseErrorDetails(error.invalidSchemaError).description
            }`,
          ),
        ]
      case 'cannot-extract-component':
        return [
          simpleErrorMessage(
            fileName,
            `Malformed component registration: ${error.componentExtractionError}`,
          ),
        ]
      case 'registration-validation-failed':
        return [
          simpleErrorMessage(
            fileName,
            `Validation failed: ${messageForComponentRegistrationValidationError(
              error.validationError,
            )}`,
          ),
        ]
      default:
        assertNever(error)
    }
  })
}

export interface ParsedTextFileWithPath {
  file: ParsedTextFile
  path: string
}

export async function maybeUpdatePropertyControls(
  previousPropertyControlsInfo: PropertyControlsInfo,
  filesToUpdate: ParsedTextFileWithPath[],
  workers: UtopiaTsWorkers,
  dispatch: EditorDispatch,
  evaluator: ModuleEvaluator,
) {
  let componentDescriptorUpdates: ComponentDescriptorFileLookup = {}
  let errors: { [filename: string]: ErrorMessage[] } = {}
  await Promise.all(
    filesToUpdate.map(async (file) => {
      const result = await getComponentDescriptorPromisesFromParseResult(file, workers, evaluator)
      errors[file.path] = errorsFromComponentRegistration(file.path, result.errors)
      if (result.descriptors.length > 0) {
        componentDescriptorUpdates[file.path] = result.descriptors
      }
    }),
  )

  const updatedPropertyControlsInfo = updatePropertyControlsOnDescriptorFileUpdate(
    previousPropertyControlsInfo,
    componentDescriptorUpdates,
  )
  dispatch([
    updatePropertyControlsInfo(updatedPropertyControlsInfo),
    setCodeEditorLintErrors(errors),
  ])
}

interface ComponentDescriptorFileLookup {
  [path: string]: ComponentDescriptorWithName[]
}

export function updatePropertyControlsOnDescriptorFileDelete(
  previousPropertyControlsInfo: PropertyControlsInfo,
  componentDescriptorFile: string,
): PropertyControlsInfo {
  return updatePropertyControlsOnDescriptorFileUpdate(previousPropertyControlsInfo, {
    [componentDescriptorFile]: [],
  })
}

export function updatePropertyControlsOnDescriptorFileUpdate(
  previousPropertyControlsInfo: PropertyControlsInfo,
  componentDescriptorUpdates: ComponentDescriptorFileLookup,
): PropertyControlsInfo {
  let updatedPropertyControls: PropertyControlsInfo = {}

  // go through the entries and only keep the ones that are not updated
  Object.entries(previousPropertyControlsInfo).forEach(([moduleName, moduleDescriptor]) => {
    const stillValidPropertyControls = Object.fromEntries(
      Object.entries(moduleDescriptor).filter(
        ([_, componentDescriptor]) =>
          isDefaultComponentDescriptor(componentDescriptor.source) ||
          componentDescriptorUpdates[componentDescriptor.source.sourceDescriptorFile] == null,
      ),
    )
    if (Object.keys(stillValidPropertyControls).length > 0) {
      updatedPropertyControls[moduleName] = stillValidPropertyControls
    }
  })

  // go through the updates and add them to the property controls
  Object.values(componentDescriptorUpdates).forEach((descriptors) => {
    descriptors.forEach((descriptor) => {
      if (updatedPropertyControls[descriptor.moduleName] == null) {
        updatedPropertyControls[descriptor.moduleName] = {}
      }

      updatedPropertyControls[descriptor.moduleName][descriptor.componentName] = {
        properties: descriptor.properties,
        supportsChildren: descriptor.supportsChildren,
        variants: descriptor.variants,
        preferredChildComponents: descriptor.preferredChildComponents ?? [],
        source: descriptor.source,
      }
    })
  })

  return updatedPropertyControls
}

function variantsForComponentToRegister(
  componentToRegister: ComponentToRegister,
  componentName: string,
): Array<ComponentInsertOption> {
  if (componentToRegister.variants.length > 0) {
    return componentToRegister.variants
  } else {
    // If none provided, fall back to a default insert option
    return [
      {
        label: componentName,
        code: `<${componentName} />`,
      },
    ]
  }
}

async function makePreferredChildDescriptor(
  preferredChild: PreferredChildComponent,
  componentName: string,
  moduleName: string,
  workers: UtopiaTsWorkers,
): Promise<Either<string, PreferredChildComponentDescriptor>> {
  const allRequiredImports = `import { ${componentName} } from '${preferredChild.additionalImports}';`

  const parsedParams = await getCachedParseResultForUserStrings(
    workers,
    allRequiredImports,
    // this placeholder element is placed here so that
    // `getCachedParseResultForUserStrings` can be reused to parse the imports
    // required for the preferred child
    '<placeholder />',
  )
  if (isLeft(parsedParams)) {
    return parsedParams
  }

  const variants: Array<ComponentInfo> = []
  const preferredChildVariants = preferredChild.variants ?? []

  for await (const variant of preferredChildVariants) {
    const insertOption = await parseInsertOption(
      variant,
      componentName,
      preferredChild.additionalImports ?? moduleName,
      workers,
    )
    if (isLeft(insertOption)) {
      return insertOption
    }
    const element = insertOption.value.elementToInsert()

    const isBuiltinElementType =
      element.type === 'JSX_CONDITIONAL_EXPRESSION' ||
      element.type === 'JSX_FRAGMENT' ||
      (element.type === 'JSX_ELEMENT' && isIntrinsicHTMLElement(element.name))

    if (isBuiltinElementType) {
      variants.push({ ...insertOption.value, importsToAdd: {} })
    } else {
      variants.push(insertOption.value)
    }
  }

  return right({
    name: preferredChild.name,
    imports: parsedParams.value.importsToAdd,
    variants: variants,
  })
}

type PropertyDescriptorResult<T> = Either<string, T>

async function parseJSXControlDescription(
  descriptor: JSXControlDescriptionFromUtopia,
  context: { moduleName: string; workers: UtopiaTsWorkers },
): Promise<PropertyDescriptorResult<JSXControlDescription>> {
  if (descriptor.preferredChildComponents == null) {
    return right({
      ...descriptor,
      preferredChildComponents: undefined,
    })
  }
  const parsedPreferredChildComponents = sequenceEither(
    await Promise.all(
      descriptor.preferredChildComponents.map((preferredChildDescriptor) =>
        makePreferredChildDescriptor(
          preferredChildDescriptor,
          preferredChildDescriptor.name,
          context.moduleName,
          context.workers,
        ),
      ),
    ),
  )

  return mapEither(
    (preferredChildComponents) => ({
      ...descriptor,
      preferredChildComponents,
    }),
    parsedPreferredChildComponents,
  )
}

async function makeRegularControlDescription(
  descriptor: RegularControlDescriptionFromUtopia,
  context: { moduleName: string; workers: UtopiaTsWorkers },
): Promise<PropertyDescriptorResult<RegularControlDescription>> {
  if (isBaseControlDescription(descriptor)) {
    if (descriptor.control === 'jsx') {
      const parsedJSXControlDescription = parseJSXControlDescription(descriptor, context)
      return parsedJSXControlDescription
    }
    return right(descriptor)
  }
  switch (descriptor.control) {
    case 'array':
      const parsedArrayPropertyControl = await makeRegularControlDescription(
        descriptor.propertyControl,
        context,
      )
      return mapEither(
        (propertyControl) => ({ ...descriptor, propertyControl }),
        parsedArrayPropertyControl,
      )
    case 'object':
      const parsedObject: ObjectControlDescription['object'] = {}
      for await (const [key, value] of Object.entries(descriptor.object)) {
        const parsedValue = await makeRegularControlDescription(value, context)
        if (isLeft(parsedValue)) {
          return parsedValue
        }
        parsedObject[key] = parsedValue.value
      }
      return right({ ...descriptor, object: parsedObject })
    case 'tuple':
      const parsedTuplePropertyControls = sequenceEither(
        await Promise.all(
          descriptor.propertyControls.map((tuplePropertyControl) =>
            makeRegularControlDescription(tuplePropertyControl, context),
          ),
        ),
      )

      return mapEither(
        (propertyControls) => ({ ...descriptor, propertyControls }),
        parsedTuplePropertyControls,
      )

    case 'union':
      const parsedUnionPropertyControls = sequenceEither(
        await Promise.all(
          descriptor.controls.map((tuplePropertyControl) =>
            makeRegularControlDescription(tuplePropertyControl, context),
          ),
        ),
      )

      return mapEither((controls) => ({ ...descriptor, controls }), parsedUnionPropertyControls)
    default:
      assertNever(descriptor)
  }
}

async function makePropertyDescriptors(
  properties: PropertyControlsFromUtopiaAPI,
  context: { moduleName: string; workers: UtopiaTsWorkers },
): Promise<PropertyDescriptorResult<PropertyControls>> {
  let result: PropertyControls = {}

  for await (const [propertyName, descriptor] of Object.entries(properties)) {
    if (descriptor.control === 'folder') {
      const parsedControlsInFolder = await makePropertyDescriptors(descriptor.controls, context)
      if (isLeft(parsedControlsInFolder)) {
        return parsedControlsInFolder
      }
      result['propertyName'] = { ...descriptor, controls: parsedControlsInFolder.value }
    } else {
      const parsedRegularControl = await makeRegularControlDescription(descriptor, context)
      if (isLeft(parsedRegularControl)) {
        return parsedRegularControl
      }
      result[propertyName] = parsedRegularControl.value
    }
  }

  return right(result)
}

export async function componentDescriptorForComponentToRegister(
  componentToRegister: ComponentToRegister,
  componentName: string,
  moduleName: string,
  workers: UtopiaTsWorkers,
  source: ComponentDescriptorSource,
): Promise<Either<string, ComponentDescriptorWithName>> {
  const insertOptionsToParse = variantsForComponentToRegister(componentToRegister, componentName)

  const parsedInsertOptionPromises = insertOptionsToParse.map((insertOption) =>
    parseInsertOption(insertOption, componentName, moduleName, workers),
  )

  const parsedVariantsUnsequenced = await Promise.all(parsedInsertOptionPromises)
  const parsedVariants = sequenceEither(parsedVariantsUnsequenced)
  const parsePreferredChildrenPromises =
    componentToRegister.preferredChildComponents == null
      ? []
      : componentToRegister.preferredChildComponents.map((c) =>
          makePreferredChildDescriptor(c, c.name, moduleName, workers),
        )

  const parsedPreferredChildren = sequenceEither(await Promise.all(parsePreferredChildrenPromises))
  if (isLeft(parsedPreferredChildren)) {
    return parsedPreferredChildren
  }

  const properties = await makePropertyDescriptors(componentToRegister.properties, {
    moduleName,
    workers,
  })

  if (isLeft(properties)) {
    return properties
  }

  return mapEither((variants) => {
    return {
      componentName: componentName,
      supportsChildren: componentToRegister.supportsChildren,
      preferredChildComponents: parsedPreferredChildren.value,
      properties: properties.value,
      variants: variants,
      moduleName: moduleName,
      source: source,
    }
  }, parsedVariants)
}

function fullyParsePropertyControls(value: unknown): ParseResult<PropertyControlsFromUtopiaAPI> {
  return parseObject(parseControlDescription)(value)
}

function parseComponentInsertOption(value: unknown): ParseResult<ComponentInsertOption> {
  return applicative3Either(
    (code, additionalImports, label) => {
      let insertOption: ComponentInsertOption = {
        code: code,
      }

      setOptionalProp(insertOption, 'additionalImports', additionalImports)
      setOptionalProp(insertOption, 'label', label)

      return insertOption
    },
    objectKeyParser(parseString, 'code')(value),
    optionalObjectKeyParser(parseString, 'additionalImports')(value),
    optionalObjectKeyParser(parseString, 'label')(value),
  )
}

export function parsePreferredChild(value: unknown): ParseResult<PreferredChildComponent> {
  return applicative3Either(
    (name, additionalImports, variants) => ({ name, additionalImports, variants }),
    objectKeyParser(parseString, 'name')(value),
    optionalObjectKeyParser(parseString, 'additionalImports')(value),
    optionalObjectKeyParser(parseArray(parseComponentInsertOption), 'variants')(value),
  )
}

function parseComponentToRegister(value: unknown): ParseResult<ComponentToRegister> {
  return applicative5Either(
    (component, properties, supportsChildren, variants, preferredChildComponents) => {
      return {
        component: component,
        properties: properties,
        supportsChildren: supportsChildren,
        variants: variants,
        preferredChildComponents: preferredChildComponents,
      }
    },
    objectKeyParser(parseAny, 'component')(value),
    objectKeyParser(fullyParsePropertyControls, 'properties')(value),
    objectKeyParser(parseBoolean, 'supportsChildren')(value),
    objectKeyParser(parseArray(parseComponentInsertOption), 'variants')(value),
    optionalObjectKeyParser(parseArray(parsePreferredChild), 'preferredChildComponents')(value),
  )
}

export const parseComponents: (
  value: unknown,
) => ParseResult<{ [componentName: string]: ComponentToRegister }> =
  parseObject(parseComponentToRegister)

export function getThirdPartyControlsIntrinsic(
  elementName: string,
  propertyControlsInfo: PropertyControlsInfo,
  projectContents: ProjectContentTreeRoot,
): PropertyControls | null {
  const packageJsonFile = packageJsonFileFromProjectContents(projectContents)
  const dependencies = dependenciesFromPackageJson(packageJsonFile, 'combined')
  const foundPackageWithElement = Object.keys(propertyControlsInfo).find((key) => {
    return (
      propertyControlsInfo[key][elementName] != null &&
      dependencies.some((dependency) => dependency.name === key)
    )
  })
  if (foundPackageWithElement != null) {
    return propertyControlsInfo[foundPackageWithElement]?.[elementName]?.properties
  }
  return null
}
