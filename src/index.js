export { default as CakeDesigner } from './designer/CakeDesigner.jsx';
export { default as PatternBuilder } from './designer/PatternBuilder.jsx';
export { default as PatternBuilderCanvas, placementPosition, getOverlappingIds, ALL_TIER_GEOM } from './designer/canvas/PatternBuilderCanvas.jsx';
export { default as CakeCanvas, CakeThumbnailCanvas, CakePreview } from './designer/canvas/CakeCanvas.jsx';
export { default as CreateTemplate } from './admin/CreateTemplate.jsx';
export { default as CustomerStorefront } from './storefront/CustomerStorefront.jsx';
export { default as AuthGate } from './auth/AuthGate.jsx';
export { useCakeDesign, toCanvasConfig, TIER_RADII, FROSTING_TYPES } from './designer/hooks/useCakeDesign.js';
export { extractFromPhoto } from './designer/hooks/useExtractElements.js';
export { ZONES, PLACEMENT_MODES, ELEMENT_KINDS, ELEMENT_SLUGS } from './designer/constants.js';
// Piping-layer factory + placement resolver — exported so the admin inspiration preview builds the
// SAME tier topPipings/bottomPipings the live designer does (one factory, no drift — INVARIANTS #3).
export { makePipingLayer, pipingPlacementFromConfig } from './designer/piping/pipingLayer.js';
// 2D image pixel-recolour (the SAME function the designer runs) + the method registry — exported
// so the admin recolour tester / element authoring use the exact runtime logic, never a copy.
export { recolorImageData, RECOLOR_METHODS } from './designer/shared/color/imageRecolor.js';
// Cream finish/texture registry + the wall-geometry algorithms — exported so the admin texture
// calibrator authors against the SAME code the designer renders (no duplicated displacement maths).
export { CREAM_STYLES, STYLE_ORDER, DEFAULT_STYLE, styleDef, styleParamSchema, userStyleParams, resolveStyleParams, frostingStyleTypes, applyTextureConfig } from './designer/creamStyles.js';
export { buildStyledWall, displaceByHeightField, makeWallReliefSampler } from './designer/geometry/creamWall.js';
// Procedural chocolate-drip geometry — exported so the admin drip studio tunes against the SAME code
// the designer (CakeTier) renders (no duplicated drip maths).
export { buildDripGeometry, buildDripWeb, DRIP_DEFAULTS, DRIP_WEB_OVERLAP } from './designer/geometry/chocolateDrip.js';
export { getRusticNormalMap } from './designer/shared/textures/rusticTexture.js';
export { getWeaveNormalMap, makeWeaveField, weaveTiles } from './designer/shared/textures/weaveStencilTexture.js';
export { makeLusterDustMaps, LUSTER_DUST_DEFAULTS, LUSTER_DUST_NEW_SPLASH } from './designer/shared/textures/lusterDust.js';
export { makeParticleFinishMaps } from './designer/shared/textures/particleFinish.js';
export { GOLD_LEAF_DEFAULTS, GOLD_LEAF_NEW_FLAKE, GOLD_LEAF_COLORS } from './designer/shared/textures/goldLeafFlakes.js';
export { normalMapFromImage, loadNormalMapFromUrl, loadStrokeMaps, composeStrokeTile, heightFieldFromImage, heightTextureFromField, normalTextureFromField } from './designer/shared/textures/imageNormalMap.js';
// Vendor-neutral error telemetry. Host apps inject a Sentry-backed transport via
// configureTelemetry(); until then it logs to the console. See src/telemetry/.
export { reportError, reportMessage, setContext, configureTelemetry } from './telemetry/index.js';
export { ErrorBoundary } from './telemetry/ErrorBoundary.jsx';
export { installGlobalHandlers } from './telemetry/globalHandlers.js';
