export { default as CakeDesigner } from './designer/CakeDesigner.jsx';
export { default as PatternBuilder } from './designer/PatternBuilder.jsx';
export { default as PatternBuilderCanvas, placementPosition, getOverlappingIds, ALL_TIER_GEOM } from './designer/canvas/PatternBuilderCanvas.jsx';
export { default as CakeCanvas, CakeThumbnailCanvas, CakePreview } from './designer/canvas/CakeCanvas.jsx';
// One catalogue element on a cake, placed by the designer's OWN addSticker and drawn by its own
// scene — so the admin preview is a mount of the designer, not a second renderer that drifts.
// `zoneMode` rides along because a caller choosing a zone must resolve the element's mode the same
// way the designer does.
export { default as ElementPreview } from './designer/preview/ElementPreview.jsx';
export { zoneMode, zoneCfg, zoneSeat, zoneInsert } from './designer/placement.js';
// The shape picker's camera and its capture helper. Exported because the Cake Shape Studio SAVES a
// thumbnail through this exact view and the picker falls back to a live tile through it — one camera, or
// a shape would change appearance the moment somebody photographed it. captureThumbnailBlob is the ONE
// canvas→blob path (the same one order placement and template save use), not a second copy in admin.
export { shapeView } from './designer/controls/ShapePicker.jsx';
export { captureThumbnailBlob } from './designer/utils/thumbnail.js';
export { default as CreateTemplate } from './admin/CreateTemplate.jsx';
export { default as CustomerStorefront } from './storefront/CustomerStorefront.jsx';
// Print a cake's decorations: the artwork for edible paper, and the traced outline as a template to
// cut fondant around. Exported because the host decides WHERE "Cut-outs" is reached from.
export { default as CutoutSheet } from './chefsdesk/CutoutSheet.jsx';
// Exported so the DESIGNER route can gate itself with the same verification the storefront uses,
// rather than growing a second OTP screen that drifts from this one. See the "one exception" note
// in VerifyStep.jsx for why that route asks at the door when nothing else does.
export { default as VerifyStep } from './storefront/facets/VerifyStep.jsx';
export { default as OrdersPanel } from './orders/OrdersPanel.jsx';
// Shared subscription-plan picker (select-to-expand) + pricing helpers — used by the billing
// screen AND the signup onboarding wizard so the plan catalog lives in ONE place (the DB), not
// duplicated per consumer.
export { default as PlanCards } from './billing/PlanCards.jsx';
export { periodPrice, formatPlanPrice, PERIOD_SUFFIX } from './billing/planPricing.js';
export { default as AuthGate } from './auth/AuthGate.jsx';
export { useCakeDesign, toCanvasConfig, TIER_RADII, FROSTING_TYPES } from './designer/hooks/useCakeDesign.js';
export { ZONES, PLACEMENT_MODES, ELEMENT_KINDS, ELEMENT_SLUGS } from './designer/constants.js';
// The cake's DEFAULT dimensions — the sizes core actually ships. Exported so a studio can start from
// the real cake instead of inventing numbers to tune against.
export { BOTTOM_H, TIER_HEIGHT_STEP, SHEET_SIZES, SHEET_DEFAULT_KEY, SHEET_INCH_TO_WORLD } from './designer/constants.js';
// The camera the CUSTOMER looks through. Exported because a tool that exists to judge a cake's
// proportions has to show them the way the customer will see them — and the Cake Shape Studio could not
// reach these, so it invented a lens of its own (a long 18° from a low angle) and every cake read TALLER
// there than on the cake it was authoring. Same class of bug as two definitions of a heart: a second
// camera is a second opinion about what the cake looks like.
export { CAMERA_FOV, CAMERA_POSITION } from './designer/constants.js';
// Piping-layer factory + placement resolver — exported so the admin inspiration preview builds the
// SAME tier topPipings/bottomPipings the live designer does (one factory, no drift — INVARIANTS #3).
export { makePipingLayer, pipingPlacementFromConfig } from './designer/piping/pipingLayer.js';
// 2D image pixel-recolour (the SAME function the designer runs) + the method registry — exported
// so the admin recolour tester / element authoring use the exact runtime logic, never a copy.
export { recolorImageData, RECOLOR_METHODS, dominantColor, dominantColorOfImage } from './designer/shared/color/imageRecolor.js';
// CORS-qualified asset URL — every canvas/WebGL read of an R2 asset must go through this or a
// non-CORS cache entry can poison the fetch (see utils/assetUrl.js). Exported so admin authoring
// surfaces that pixel-read an element's image use the ONE qualifier the designer uses, not a copy.
export { corsUrl } from './designer/utils/assetUrl.js';
// Print exposure — the ONE rule that decides how bright a 2D print renders. Exported so the admin studios
// build their preview material from the SAME function the cake does: a studio that computes its own print
// brightness WILL drift from the designer, and that drift is the original "vivid in the studio, dull on the
// cake" bug. Import it; never re-derive it.
export { printExposure, PRINT_NEUTRAL, REFERENCE_LIGHT, SHADING, SATURATION } from './designer/shared/printExposure.js';
// Cream finish/texture registry + the wall-geometry algorithms — exported so the admin texture
// calibrator authors against the SAME code the designer renders (no duplicated displacement maths).
export { CREAM_STYLES, STYLE_ORDER, DEFAULT_STYLE, styleDef, styleParamSchema, userStyleParams, resolveStyleParams, frostingStyleTypes, applyTextureConfig } from './designer/creamStyles.js';
// Decoration surface materials (satin, …) — the finish a PLACED decoration wears, resolved from
// placement_config.material. Exported so the admin materials screen can author/list them (materialsFor).
export { DECOR_MATERIALS, materialSurface, materialsFor, applyDecorMaterialConfig } from './designer/materials.js';
// Cake shapes — the footprint catalog (seed + DB overlay) and the outline kernel every shape-dependent
// operation derives from. The admin Cake Shape Studio authors rows against exactly these.
export { CAKE_SHAPES, applyCakeShapeConfig, cakeShapeDef, cakeShapeList } from './designer/cakeShapes.js';
export { OUTLINE_FAMILIES, outlineOf, scaledOutline } from './designer/geometry/shapes.js';
// Glyph-cake sizing — the per-character-count model shared by the `number` (digits) and `letter` (A–Z)
// families (a "1"/"A" and a "21"/"AB" size independently; every string of a given count renders
// identically). Exported so the Cake Shape Studio authors byCount against the SAME defaults + resolver the
// designer sizes with (one source, no drift), and previews the true footprint.
export {
  NUMBER_COUNTS, NUMBER_SIZE_DEFAULTS, numberDigitCount, numberSizeForCount, numberTierDims,
  LETTER_COUNTS, LETTER_SIZE_DEFAULTS, letterCount, letterSizeForCount, letterTierDims,
} from './designer/geometry/glyphShape.js';
export { tierShape, perimeter, boundingRadius, topContains, topClamp } from './designer/geometry/surface.js';
export { buildStyledWall, displaceByHeightField, makeWallReliefSampler } from './designer/geometry/creamWall.js';
// Procedural chocolate-drip geometry — exported so the admin drip studio tunes against the SAME code
// the designer (CakeTier) renders (no duplicated drip maths).
export { buildDripGeometry, buildDripWeb, DRIP_DEFAULTS, DRIP_WEB_OVERLAP } from './designer/geometry/chocolateDrip.js';
// Piped grass (Wilton 233). Geometry + seats are separate on purpose: the renderer INSTANCES one
// tuft across thousands of seats, so the admin studio tunes the tuft and previews the field.
export { buildGrassTuft, grassSeats, grassTriangleCount, GRASS_DEFAULTS } from './designer/geometry/grass.js';
export { default as GrassPatch } from './designer/canvas/GrassPatch.jsx';
// The shipping light rig. Exported so an admin studio tunes a look under the SAME lights the designer
// renders it under — a colour picked beneath a brighter key is simply the wrong colour, and the
// designer's own rig carries a note about exactly that overexposure washing the cake top toward white.
export { SceneLights, SceneEnv } from './designer/canvas/CakeCanvas.jsx';
// A fondant rainbow. Generated rather than modelled because its legs have to REACH the board, which
// is a different distance on every cake — the same argument the chocolate drip made for its radius.
// Everything it is given is a ratio of the cake, so one authored rainbow suits a 6" and a 10".
export { cloudLobes, cloudPlacement, cloudBaseY, cloudGuide, cloudOutline, cloudHandleAt, cloudDragTo, CLOUD_DEFAULTS } from './designer/geometry/cloud.js';
export { default as FondantCloud } from './designer/canvas/FondantCloud.jsx';
export { RAINBOW_ARRANGEMENTS, ArrangementTile, arrangementOf, iconTiers } from './designer/decorations/RainbowArrangements.jsx';
export { rainbowBands, bandGeometry, bandPath, bandRadius, legFootY, archCenterX, requiredStandoff, rainbowBoardReach, rainbowFootReach, rainbowHandleAt, rainbowDragTo, wrapToWall, fitOnTopScale, rainbowGuide, RAINBOW_DEFAULTS } from './designer/geometry/rainbow.js';
export { default as RainbowArch } from './designer/canvas/RainbowArch.jsx';
// Fondant letter blocks. Layout is separate from the renderer for the same reason grass's is: one
// word in, N placements out, and nothing downstream owns a single block.
export { nameBlockLayout, nameBlockRun, nameBlockYaw, boardRunRadius, NAME_BLOCK_DEFAULTS } from './designer/geometry/nameBlocks.js';
export { default as NameBlocks } from './designer/canvas/NameBlocks.jsx';
// Solid relief slab geometry — exported so the admin Relief Sticker Studio previews the SAME extruded
// solid the designer renders for placement_config.relief.solid (one builder, no drift).
export { buildSolidReliefGeometry } from './designer/geometry/solidRelief.js';
// Solid-slab side-wall FINISHES (fondant/chocolate/…) + the shared wall-material factory — the studio
// authors relief.solidFinish from this ONE registry and previews the identical material (no drift).
export { SOLID_FINISHES, SOLID_FINISH_ORDER, DEFAULT_SOLID_FINISH, buildSolidWallMaterial } from './designer/geometry/solidFinishes.js';
// Editable text placeholders ({name}/{number} on a template topper) — the ONE renderer. The designer
// composites the customer's value with it and the admin Text Topper Studio previews + bakes the artwork
// with the very same functions, so the authoring preview and the cake can never disagree.
export {
  TEXT_SLOT_KINDS, DEFAULT_TEXT_STYLE, ALGORITHMS as TEXT_ALGORITHMS, resolveStyle as resolveTextStyle,
  loadStyleFont, loadSlotFonts, renderTextSlot, drawTextSlots, composeTextTopper,
  applyPatches, coverPatches, bakeArtwork, findCleanSource, findInkColor,
} from './designer/shared/textures/textSlots.js';
export { TEXT_STYLES, applyTextStyleConfig, textStyleOf } from './designer/textStyles.js';
export { getRusticNormalMap } from './designer/shared/textures/rusticTexture.js';
// Shared fondant-grain normal — the SAME matte surface the cake wall carries, reused by the Relief
// Studio so the solid-slab side walls preview identically to the designer (one texture, no drift).
export { getFondantNormalMap } from './designer/shared/textures/fondantTexture.js';
export { getWeaveNormalMap, makeWeaveField, weaveTiles } from './designer/shared/textures/weaveStencilTexture.js';
export { makeLusterDustMaps, LUSTER_DUST_DEFAULTS, LUSTER_DUST_NEW_SPLASH } from './designer/shared/textures/lusterDust.js';
export { makeParticleFinishMaps } from './designer/shared/textures/particleFinish.js';
export { GOLD_LEAF_DEFAULTS, GOLD_LEAF_NEW_FLAKE, GOLD_LEAF_COLORS } from './designer/shared/textures/goldLeafFlakes.js';
export { normalMapFromImage, loadNormalMapFromUrl, loadStrokeMaps, composeStrokeTile, heightFieldFromImage, heightTextureFromField, normalTextureFromField } from './designer/shared/textures/imageNormalMap.js';
// Image ingest — the ONE pipeline a picked image goes through before it reaches R2: the format
// allowlist + size gate (validateImageFile), the photo compressor (aspect kept, long edge capped) and
// the decoration normalizer (alpha-cropped, centred in a square). Exported because spattoo-admin's
// element authoring runs the SAME functions: a baker's uploaded decoration and an admin-authored
// element must be produced by identical code, or the two drift (they had — the admin copy honoured no
// EXIF orientation and hung forever on a file it couldn't decode).
export { ACCEPT_IMAGE, IMAGE_TYPES, MAX_IMAGE_BYTES, validateImageFile, imageExt, decodeImage, encodeWebp, compressImage, normalizeArtwork, extractLogoPalette } from './shared/image.js';
export { useUploadLimits } from './shared/useUploadLimits.js';
// Vendor-neutral error telemetry. Host apps inject a Sentry-backed transport via
// configureTelemetry(); until then it logs to the console. See src/telemetry/.
export { reportError, reportMessage, setContext, configureTelemetry } from './telemetry/index.js';
export { ErrorBoundary } from './telemetry/ErrorBoundary.jsx';
export { installGlobalHandlers } from './telemetry/globalHandlers.js';

// ── UI typography ────────────────────────────────────────────────────────────
// SEC-WEB-7: this library NAMES its font but no longer LOADS it — it used to
// @import Google Fonts from 17 places, putting a third-party origin in every
// host app's CSP. Host apps must self-host the families in REQUIRED_FONT_FAMILIES
// (spattoo-web: next/font/google; spattoo-admin: a self-hosted @font-face).
// `warnIfFontsMissing()` runs on import and warns exactly once if they didn't —
// a missing webfont silently falls back to a system font, which is how the
// storefront FONT_THEMES fonts went unloaded for months without anyone noticing.
export { UI_FONT, REQUIRED_FONT_FAMILIES, warnIfFontsMissing } from './shared/fonts.js';
import { warnIfFontsMissing as _warnIfFontsMissing } from './shared/fonts.js';
_warnIfFontsMissing();
