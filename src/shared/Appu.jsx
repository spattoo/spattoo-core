/* ── Appu ────────────────────────────────────────────────────────────────────────────────────────
 *
 * The assistant's face. He peeks over a line in the bottom-right corner, reacts to what the
 * assistant is doing, and says nothing — the words are the panel's job.
 *
 * ── AUTO-TRACED FROM SANDEEP'S REFERENCE ────────────────────────────────────────────────────────
 * ⚠️ BODY IS HIS ARTWORK, NOT MY APPROXIMATION OF IT. Nine rounds of hand-drawing this from the
 * reference were rejected: *"they are not same"*, *"somehow i did not like any of them"*, *"most of
 * them are not showing real emotion"*, *"character is not correct... see the hair"*, *"you are
 * taking more attempts because you are not focusing on whats asked"*. Measuring the features fixed
 * their SIZES and never fixed the drawing, because a bounding box cannot tell you which way a line
 * bends. Every round traded one flaw for another.
 *
 * So BODY below is the reference's own ink, auto-traced: threshold the image, take its largest
 * connected component, walk the boundary (Moore tracing), simplify (Ramer-Douglas-Peucker at 0.7px)
 * and punch out the enclosed gaps with fill-rule evenodd. The head, the hair, the hands, the arms
 * and the line are therefore pixel-faithful — they are not a drawing OF the reference, they ARE it.
 *
 * ⚠️ THE FACE IS DELIBERATELY EMPTY. The eyes, mouth and cowlick are their own connected
 * components in that image, so taking only the largest one leaves a blank face — which is exactly
 * what nine changing expressions need. Those we still draw, at the positions measured from the
 * same image: eyes 20x38 at (153,293) and (248,247), mouth 62x70 at (215,336), blush 31x36 at
 * (129,345) and (284,271).
 *
 * ⚠️ NONZERO WITH REVERSED HOLES, AND JACOB'S STOPPING CRITERION. Two tracing bugs each produced
 * a plausible-looking wrong figure. Stopping the boundary walk on "we are back at the start pixel"
 * cuts it short wherever a thin stroke makes the boundary pass that pixel twice — the contour then
 * closed across the arms and filled the gaps between them solid. Stop instead when the start is
 * re-entered FROM THE SAME DIRECTION, and the contour went from 3163 points to 6326. With the
 * complete contour, fill-rule evenodd then cancels most of the figure to white, because the walk
 * traverses both sides of every stroke: nonzero fills it, and a hole punches through only if it
 * winds the opposite way, so the hole contours are reversed.
 *
 * ⚠️ POLYGONS, NOT SMOOTHED CURVES. Catmull-Rom through the traced points overshoots wherever the
 * contour reverses sharply — the tip of an 8px arm, a 7-point hole — and the arms came out as a
 * star of spikes. At 0.7px tolerance on a 625-wide trace shown at ~124px, a segment is a seventh
 * of a display pixel: straight and curved are indistinguishable.
 *
 * ⚠️ TO RE-TRACE, the reference goes in as a PNG and the two scripts are in the feature doc. Do not
 * hand-edit BODY.
 *
 * ⚠️ THE HAIR IS THE SIGNATURE AND IT HAS RULES. Three SEPARATE strokes, each starting outside the
 * head on the left and sweeping up across the crown, never touching. The first draft drew them
 * short and overlapping and they merged into one dark lump that read as a cap. The gaps are the
 * whole effect.
 *
 * ⚠️ PROPORTION IS THE STYLE, as the storefront Appu's own file says: *"Cute is not a rendering
 * style, it is a ratio."* The head is most of him. The hands exist to be a SECOND axis — a floating
 * head can only change its face, where hands can scratch, shrug, wave or hold up a palm, and that
 * is what keeps nine states from collapsing into five.
 *
 * ── WHAT ANIMATES, AND WHAT DELIBERATELY DOES NOT ───────────────────────────────────────────────
 * ⚠️ ONLY THE STATES THAT ARE *ONGOING* LOOP. `thinking` and `thinking_long` repeat because work is
 * still happening and the loop is the message. Everything else plays ONCE on arrival and settles.
 * A character looping in the corner of a screen somebody is trying to work on becomes something to
 * resent within a day — the same reason the panel's wait animation only appears past 1200ms.
 *
 * ⚠️ AND IT ALL STOPS FOR `prefers-reduced-motion`. Not softened: stopped. Every pose is drawn to
 * read as a still, so the information survives with no motion at all.
 */
import { useId } from 'react';
import { ASSISTANT } from './assistantState.js';
import { INK } from './tokens.js';

const BLUSH = '#F6C9CE';
const SAGE = '#A8CFC4';
const CORAL = '#E8927C';

/* ── The geometry is MEASURED, not judged by eye ─────────────────────────────────────────────────
 * Every coordinate here comes from the sticker's own pixels, read by flood-filling its connected
 * dark and pink regions: eyes 20x38 at (153,293) and (248,247), mouth 62x70 at (215,336), blush
 * 31x36 at (129,345) and (284,271). Six rounds of drawing by eye got all three wrong in the same
 * direction — the mouth at half its true height, the blush at twice its true flatness — and no
 * amount of looking fixed it. The coordinate space is the sticker's own crop, so these numbers
 * stay checkable against it.
 *
 * ⚠️ THE HEAD IS AN EGG AND THE FACE IS OFF-CENTRE. Narrow at the crown, fat at the jaw, with the
 * right eye sitting higher than the left. That asymmetry is the tilt, baked in rather than applied
 * as a rotation — rotating the group moved the hands with it and tucked them behind the skull.
 *
 * ⚠️ THE HANDS ARE AT THE CHEEKS, elbows splayed down to the table. Not clasped in the middle:
 * chin-on-hands is what the pose actually is.
 */
const BODY = 'M156 56L161 56L166 61L164 69L152 69L151 71L146 72L136 80L134 80L133 83L125 89L124 92L117 99L106 117L99 134L97 135L97 140L95 142L95 147L93 149L93 155L91 157L90 168L88 172L88 187L90 189L103 174L107 173L111 169L116 153L121 143L123 142L125 136L132 128L134 123L143 114L143 112L163 93L182 81L186 81L187 79L201 75L213 76L217 79L219 86L216 91L207 86L201 86L192 89L191 91L186 92L177 97L175 100L172 100L168 105L159 111L153 117L153 119L146 125L137 139L135 140L135 142L133 143L131 150L126 156L117 176L97 196L97 198L88 209L88 212L80 222L79 226L75 230L73 235L73 241L71 243L71 246L66 257L66 261L64 263L64 268L59 283L59 293L57 296L57 332L59 335L59 345L61 347L64 363L66 364L66 369L68 370L68 374L70 375L74 385L78 387L82 384L90 383L95 384L100 389L102 389L108 395L117 408L117 410L119 411L122 421L121 427L127 431L131 431L143 437L155 437L158 439L189 439L192 437L202 437L207 434L222 431L223 429L229 428L230 426L240 423L243 420L246 420L248 417L251 417L252 415L256 414L263 408L262 400L264 389L270 376L279 366L279 364L284 361L288 356L293 353L296 353L299 350L307 352L310 349L315 338L315 335L317 333L317 328L319 327L322 312L324 310L327 282L326 254L324 249L324 241L322 239L317 219L315 218L315 215L308 201L306 200L295 183L276 165L272 164L267 159L262 156L259 156L251 150L238 147L236 145L223 144L219 142L199 142L197 144L183 148L182 150L179 150L177 153L171 156L153 174L151 178L145 178L143 176L143 168L149 160L158 151L160 151L164 146L172 140L174 140L176 137L180 137L181 135L186 134L194 129L198 129L199 127L204 126L207 123L222 120L225 118L231 118L235 123L235 130L223 131L222 134L218 135L231 135L236 137L243 137L250 140L256 140L261 143L265 143L271 146L272 148L276 149L277 151L280 151L281 154L283 154L294 163L316 191L318 197L325 208L325 212L327 213L327 217L329 219L329 223L334 235L334 242L336 244L336 259L338 261L338 290L336 294L336 304L334 308L334 314L332 317L331 325L329 327L327 340L325 341L325 345L317 362L318 385L316 387L316 391L314 392L314 396L312 397L309 404L300 416L327 445L327 447L333 454L334 458L336 459L338 471L340 473L412 473L415 479L414 483L339 484L332 492L326 493L311 492L308 489L305 489L302 486L298 486L296 484L96 484L77 492L62 495L49 494L45 492L42 487L38 484L0 484L0 473L40 473L47 459L56 450L56 448L74 433L74 426L71 424L69 421L69 417L67 416L67 406L69 401L62 386L60 385L60 381L58 380L58 375L56 374L56 370L51 359L51 352L49 348L49 337L47 332L47 300L49 298L49 286L51 283L51 277L48 277L48 280L44 288L44 292L39 302L39 307L37 308L37 315L35 317L35 324L33 326L32 337L30 341L28 366L30 370L30 382L32 384L33 393L28 397L25 396L22 392L22 388L20 385L20 342L22 338L22 328L24 326L24 321L27 314L27 308L29 307L31 294L33 293L36 282L38 280L38 276L47 259L47 256L54 243L56 242L58 235L60 234L65 224L80 204L80 160L82 157L87 135L96 118L96 115L98 114L107 96L110 94L116 86L116 84L127 73L141 62L156 56L161 56L166 61L164 69L152 69L151 71L146 72L136 80L134 80L133 83L125 89L124 92L117 99L106 117L99 134L97 135L97 140L95 142L95 147L93 149L93 155L91 157L90 168L88 172L88 187L90 189L103 174L107 173L111 169L116 153L121 143L123 142L125 136L132 128L134 123L143 114L143 112L163 93L182 81L186 81L187 79L201 75L213 76L217 79L219 86L216 91L207 86L201 86L192 89L191 91L186 92L177 97L175 100L172 100L168 105L159 111L153 117L153 119L146 125L137 139L135 140L135 142L133 143L131 150L126 156L117 176L97 196L97 198L88 209L88 212L80 222L79 226L75 230L73 235L73 241L71 243L71 246L66 257L66 261L64 263L64 268L59 283L59 293L57 296L57 332L59 335L59 345L61 347L64 363L66 364L66 369L68 370L68 374L70 375L74 385L78 387L82 384L90 383L95 384L100 389L102 389L108 395L117 408L117 410L119 411L122 421L121 427L127 431L131 431L143 437L155 437L158 439L189 439L192 437L202 437L207 434L222 431L223 429L229 428L230 426L240 423L243 420L246 420L248 417L251 417L252 415L256 414L263 408L262 400L264 389L270 376L279 366L279 364L284 361L288 356L293 353L296 353L299 350L307 352L310 349L315 338L315 335L317 333L317 328L319 327L322 312L324 310L327 282L326 254L324 249L324 241L322 239L317 219L315 218L315 215L308 201L306 200L295 183L276 165L272 164L267 159L262 156L259 156L251 150L238 147L236 145L223 144L219 142L199 142L197 144L183 148L182 150L179 150L177 153L171 156L153 174L151 178L145 178L143 176L143 168L149 160L158 151L160 151L164 146L172 140L174 140L176 137L180 137L181 135L186 134L194 129L198 129L199 127L204 126L207 123L222 120L225 118L231 118L235 123L235 130L223 131L222 134L218 135L231 135L236 137L243 137L250 140L256 140L261 143L265 143L271 146L272 148L276 149L277 151L280 151L281 154L283 154L294 163L316 191L318 197L325 208L325 212L327 213L327 217L329 219L329 223L334 235L334 242L336 244L336 259L338 261L338 290L336 294L336 304L334 308L334 314L332 317L331 325L329 327L327 340L325 341L325 345L317 362L318 385L316 387L316 391L314 392L314 396L312 397L309 404L300 416L327 445L327 447L333 454L334 458L336 459L338 471L340 473L412 473L415 479L414 483L339 484L332 492L326 493L311 492L308 489L305 489L302 486L298 486L296 484L96 484L77 492L62 495L49 494L45 492L42 487L38 484L0 484L0 473L40 473L47 459L56 450L56 448L74 433L74 426L71 424L69 421L69 417L67 416L67 406L69 401L62 386L60 385L60 381L58 380L58 375L56 374L56 370L51 359L51 352L49 348L49 337L47 332L47 300L49 298L49 286L51 283L51 277L48 277L48 280L44 288L44 292L39 302L39 307L37 308L37 315L35 317L35 324L33 326L32 337L30 341L28 366L30 370L30 382L32 384L33 393L28 397L25 396L22 392L22 388L20 385L20 342L22 338L22 328L24 326L24 321L27 314L27 308L29 307L31 294L33 293L36 282L38 280L38 276L47 259L47 256L54 243L56 242L58 235L60 234L65 224L80 204L80 160L82 157L87 135L96 118L96 115L98 114L107 96L110 94L116 86L116 84L127 73L141 62L155 57ZM265 424L264 425L262 425L260 428L257 429L255 431L252 431L251 433L246 435L246 438L254 442L256 444L258 444L261 447L263 447L265 450L267 450L271 453L273 453L274 455L278 456L279 458L282 458L290 464L293 464L296 467L298 467L299 469L306 470L308 472L325 472L325 468L323 467L323 465L321 463L320 460L314 451L312 450L312 448L311 448L309 445L307 444L307 442L305 441L303 437L301 437L300 436L300 434L298 433L298 431L297 431L296 429L293 427L289 429L286 429L285 431L279 431L276 429L272 428L269 423L265 423L264 425L262 425L261 426L260 428L257 429L255 431L252 431L251 433L246 435L246 438L254 442L256 444L258 444L261 447L263 447L265 450L267 450L271 453L273 453L274 455L278 456L279 458L282 458L290 464L293 464L296 467L298 467L299 469L306 470L308 472L325 472L325 468L323 467L323 465L321 463L320 460L314 451L312 450L312 448L311 448L309 445L307 444L307 442L305 441L303 437L301 437L300 436L300 434L298 433L298 431L296 430L296 429L293 427L289 429L286 429L285 431L279 431L276 429L272 428L269 423L265 423ZM82 443L80 443L80 444L78 445L78 446L74 449L73 451L69 454L68 456L67 456L67 457L62 462L60 466L58 467L58 469L56 472L88 472L89 470L95 469L96 467L101 466L103 464L106 464L107 462L111 461L114 458L117 458L118 456L122 455L123 453L128 452L129 450L133 450L133 447L131 446L129 446L128 445L123 445L122 443L118 443L116 442L105 451L94 451L91 448L89 448L88 447L88 445L83 442L82 443L80 443L80 444L78 445L78 446L74 449L73 451L69 454L68 456L67 456L67 457L62 462L60 466L58 467L58 469L56 472L88 472L89 470L95 469L96 467L101 466L103 464L106 464L107 462L111 461L114 458L117 458L118 456L122 455L123 453L128 452L129 450L133 450L133 447L131 446L129 446L128 445L123 445L122 443L118 443L116 442L105 451L94 451L91 448L89 448L88 447L88 445L83 442ZM216 446L213 448L208 448L203 451L190 451L186 453L170 453L170 472L222 472L222 457L221 456L221 451L220 450L220 445L217 445L213 448L208 448L203 451L190 451L186 453L170 453L170 472L222 472L222 457L221 456L221 451L220 450L220 445L217 445ZM303 362L300 364L298 364L296 367L294 367L293 369L290 370L288 374L286 375L286 377L284 378L281 382L279 387L275 391L274 394L272 396L272 408L274 411L274 413L277 415L277 416L283 416L284 414L286 414L288 411L289 411L294 406L300 398L300 396L302 394L305 388L305 385L307 383L307 365L304 361L300 364L298 364L296 367L294 367L293 369L290 370L288 374L286 375L286 377L284 378L281 382L279 387L275 391L274 394L272 396L272 408L274 411L274 413L277 415L277 416L283 416L284 414L286 414L288 411L289 411L294 406L300 398L300 396L302 394L305 388L305 385L307 383L307 365L304 361ZM84 398L82 398L81 400L79 401L78 405L76 406L76 413L80 419L80 421L83 423L85 427L87 428L87 430L88 430L90 433L94 436L104 436L109 429L109 417L108 416L108 414L106 413L106 411L104 410L102 406L100 405L99 403L96 403L95 401L91 400L89 398L87 398L86 397L82 398L81 400L79 401L78 405L76 406L76 413L80 419L80 421L83 423L85 427L87 428L87 430L88 430L90 433L94 436L104 436L106 434L109 429L109 417L108 416L108 414L106 413L106 411L104 410L102 406L100 405L99 403L96 403L95 401L85 397ZM248 457L248 462L250 465L250 472L273 472L273 471L270 470L269 468L267 467L265 467L264 465L261 465L258 462L255 461L254 459L252 459L248 456L248 462L250 465L250 472L273 472L273 471L270 470L269 468L267 467L265 467L264 465L261 465L258 462L255 461L254 459L252 459L248 456ZM142 460L136 463L135 465L132 465L130 467L127 468L126 470L122 471L123 472L141 472L142 471L142 465L144 463L144 459L136 463L135 465L132 465L130 467L127 468L126 470L122 471L123 472L141 472L142 471L142 465L144 463L144 459L143 459ZM230 444L230 451L231 452L231 456L232 457L232 470L233 472L234 471L238 471L238 465L235 457L235 451L233 446L233 443L230 443L230 451L231 452L231 456L232 457L232 470L233 472L234 471L238 471L238 465L235 457L235 451L233 446L233 443L230 443ZM155 454L154 455L154 466L152 467L152 472L159 472L160 470L160 454L156 453L154 455L154 466L152 467L152 472L159 472L160 470L160 454L156 453Z';

const eye = (x, y, rx, ry) =>
  <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={INK} stroke="none" transform={`rotate(-12 ${x} ${y})`} />;

const EYES = {
  open:   <>{eye(153, 293, 10, 19)}{eye(248, 247, 10, 19)}</>,
  up:     <>{eye(153, 285, 10, 19)}{eye(248, 239, 10, 19)}</>,
  side:   <>{eye(160, 291, 9, 18)}{eye(255, 245, 9, 18)}</>,
  down:   <>{eye(153, 302, 10, 16)}{eye(248, 256, 10, 16)}</>,
  happy:  <><path d="M140 300 C147 286 160 286 167 299" strokeWidth="9" />
            <path d="M235 254 C242 240 255 240 262 253" strokeWidth="9" /></>,
  squint: <><path d="M139 294 C148 284 161 286 168 296" strokeWidth="8" />
            <path d="M234 248 C243 238 256 240 263 250" strokeWidth="8" />
            {eye(153, 282, 7, 9)}{eye(248, 236, 7, 9)}</>,
  wide:   <><circle cx="153" cy="293" r="19" fill="#fff" strokeWidth="7" />
            <circle cx="248" cy="247" r="19" fill="#fff" strokeWidth="7" />
            <circle cx="153" cy="295" r="9" fill={INK} stroke="none" />
            <circle cx="248" cy="249" r="9" fill={INK} stroke="none" /></>,
};

const BROW = {
  none: null,
  raised:  <><path d="M136 258 C146 248 164 250 172 258" strokeWidth="7" />
             <path d="M231 212 C241 202 259 204 267 212" strokeWidth="7" /></>,
  /* ⚠️ BOTH INNER CORNERS UP. One up and one down is the universal drawing of SLY. */
  worried: <><path d="M136 266 C146 254 164 256 172 266" strokeWidth="7" />
             <path d="M231 216 C241 228 259 226 267 216" strokeWidth="7" /></>,
  flat:    <><path d="M137 262 H171" strokeWidth="7" /><path d="M232 216 H266" strokeWidth="7" /></>,
};

/* ⚠️ A CRESCENT SMILE, NOT A HOLE. The reference's mouth is an upper-lip line RISING TO THE RIGHT
   with the opening bulging down-LEFT under it, and a tongue catching the light at the bottom. Drawn
   as an upright oval — which is what the blob measurement's 62x70 bounding box invites — it reads
   as a mouth hanging open in surprise, and that one shape made every happy pose look startled. The
   box was right; the shape inside it was not. A bounding box cannot tell you which way a curve
   bends, and that is the whole expression — but it DOES fix the size, and redrawing the shape
   without re-checking the box produced a crescent 1.7x too big, which read as a different fault.
   ⚠️ The tongue is what makes it a SMILE rather than a shout; it sits low and LEFT, in the bulge. */
const MOUTH = {
  smile:     <><path d="M186 330 C198 318 222 306 240 302 C248 330 238 368 212 369 C196 370 182 350 186 330 z" fill={INK} strokeWidth="5" />
               <ellipse cx="206" cy="357" rx="13" ry="6.5" fill="#fff" stroke="none" transform="rotate(-14 206 357)" /></>,
  openSmile: <><path d="M182 330 C196 316 224 302 244 298 C254 330 244 374 212 375 C194 376 178 352 182 330 z" fill={INK} strokeWidth="5" />
               <ellipse cx="206" cy="361" rx="15" ry="7" fill="#fff" stroke="none" transform="rotate(-14 206 361)" /></>,
  grin:      <><path d="M178 328 C194 312 228 296 250 292 C262 330 250 382 210 383 C190 384 174 354 178 328 z" fill={INK} strokeWidth="5" />
               <ellipse cx="204" cy="366" rx="17" ry="8" fill="#fff" stroke="none" transform="rotate(-14 204 366)" /></>,
  flat:      <path d="M186 332 H244" strokeWidth="8" />,
  wavy:      <path d="M184 330 C196 314 208 346 218 330 C228 314 236 344 246 332" strokeWidth="8" />,
  oh:        <ellipse cx="215" cy="336" rx="22" ry="29" fill={INK} stroke="none" />,
};

/* The left hand rests at the cheek in every pose; only the right one acts. */
/* ⚠️ THE RESTING HANDS ARE PART OF THE TRACE and cannot move — they are the reference's own ink.
   A gesture is therefore an EXTRA hand, raised beside the head well above them (y<260, where the
   traced ones sit near y 400), which is what a person resting on a table and raising one hand
   actually looks like. Trying instead to erase the traced hands and redraw them took the head's
   own chin with them. */
const RaisedHand = ({ x, y }) => (
  <path transform={`translate(${x} ${y}) scale(1.15)`}
        d="M0 0 C-26 8 -28 44 -6 54 C18 64 36 37 26 15 C21 2 11 -4 0 0 z"
        fill="#fff" stroke={INK} strokeWidth="9" />
);

/* ⚠️ A SHORT STUB THAT MEETS THE SKULL, NOT A STICK TO THE TABLE. Run down to the ground line the
   raised arm becomes a thin pole with a circle on top — a lollipop beside his face. The traced head
   is an ellipse at (197,291) with radii 140x149, so each stub below ends ON that edge and reads as
   an arm coming from behind him. Stroke 11 to match the weight of the traced ink; 9 looked like
   wire next to it. */
const GESTURE = {
  none:    null,
  scratch: <g className="appu-act"><path d="M346 206 C340 226 336 240 333 252" strokeWidth="11" />
             <RaisedHand x={352} y={166} /></g>,
  wave:    <g className="appu-act"><path d="M358 164 C352 190 345 212 340 236" strokeWidth="11" />
             <RaisedHand x={362} y={122} /></g>,
  palm:    <g className="appu-act"><path d="M340 292 C337 312 334 328 331 342" strokeWidth="11" />
             <path d="M344 228 C324 228 316 248 316 268 L316 296 C316 312 332 320 348 320 C366 320 378 310 378 294 L378 258 C378 238 364 228 344 228 z"
                   fill="#fff" strokeWidth="8" />
             <path d="M330 240 V268 M348 234 V268 M366 242 V270" strokeWidth="6" /></g>,
  point:   <g className="appu-act"><path d="M344 236 C339 252 335 264 332 274" strokeWidth="11" />
             <RaisedHand x={348} y={194} /><path d="M380 190 L424 156" strokeWidth="8" /></g>,
};

/* All on the hair-free side of the head, clear of the traced outline (which reaches x=338). */
const MARKS = {
  [ASSISTANT.THINKING]:      <g className="appu-dots"><circle cx="350" cy="126" r="9" fill={SAGE} /><circle cx="388" cy="92" r="14" fill={SAGE} /></g>,
  [ASSISTANT.THINKING_LONG]: <g className="appu-dots"><circle cx="350" cy="126" r="9" fill={SAGE} /><circle cx="388" cy="92" r="14" fill={SAGE} /></g>,
  [ASSISTANT.ANSWERED]:      <g className="appu-marks"><path d="M356 142 L370 112" stroke={SAGE} strokeWidth="9" /><path d="M384 176 L416 162" stroke={SAGE} strokeWidth="9" /></g>,
  [ASSISTANT.FAILED]:        <g className="appu-marks"><path d="M352 136 L338 106" stroke={CORAL} strokeWidth="9" /><path d="M382 118 L378 86" stroke={CORAL} strokeWidth="9" /></g>,
  [ASSISTANT.ESCALATED]:     <g className="appu-marks"><path d="M366 250 h54 l-27 22 z" fill={SAGE} stroke="none" /></g>,
  [ASSISTANT.DECLINED]:      <g className="appu-marks"><path d="M372 196 C390 186 394 168 390 150" stroke={SAGE} strokeWidth="7" /></g>,
};

const POSE = {
  /* ⚠️ IDLE IS THE REFERENCE POSE, UNCHANGED — resting on folded hands, waiting. It is the one a
     baker sees most and the one Sandeep approved the artwork on, so it adds nothing of its own. */
  [ASSISTANT.IDLE]:          { eyes: 'open',   brow: 'none',    mouth: 'smile',     gesture: 'none' },
  [ASSISTANT.LISTENING]:     { eyes: 'up',     brow: 'raised',  mouth: 'openSmile', gesture: 'none' },
  [ASSISTANT.THINKING]:      { eyes: 'side',   brow: 'raised',  mouth: 'flat',      gesture: 'none' },
  [ASSISTANT.THINKING_LONG]: { eyes: 'squint', brow: 'none',    mouth: 'wavy',      gesture: 'scratch' },
  [ASSISTANT.ANSWERED]:      { eyes: 'happy',  brow: 'none',    mouth: 'grin',      gesture: 'wave' },
  [ASSISTANT.EMPTY]:         { eyes: 'down',   brow: 'worried', mouth: 'wavy',      gesture: 'none' },
  [ASSISTANT.DECLINED]:      { eyes: 'open',   brow: 'flat',    mouth: 'flat',      gesture: 'palm' },
  [ASSISTANT.FAILED]:        { eyes: 'wide',   brow: 'worried', mouth: 'oh',        gesture: 'none' },
  [ASSISTANT.ESCALATED]:     { eyes: 'happy',  brow: 'none',    mouth: 'openSmile', gesture: 'point' },
};

const CSS = `
/* ⚠️ EVERY ANIMATION IS NAMESPACED. These keyframes live in whatever document the host mounts us
   into, beside a storefront's own CSS and admin's — a name like "bob" would collide eventually. */
@keyframes appuBlink   { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.08) } }
@keyframes appuBreathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes appuRise    { from { transform: translateY(90px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes appuScratch { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(-9deg) } }
@keyframes appuTap     { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-11px) } }
@keyframes appuWave    { 0%,100% { transform: rotate(0deg) } 25% { transform: rotate(-15deg) } 75% { transform: rotate(11deg) } }
@keyframes appuShrug   { 0% { transform: translateY(16px) } 60% { transform: translateY(-5px) } 100% { transform: none } }
@keyframes appuNo      { 0%,100% { transform: rotate(0deg) } 30% { transform: rotate(-11deg) } 70% { transform: rotate(11deg) } }
@keyframes appuShake   { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-11px) } 60% { transform: translateX(11px) } }
@keyframes appuPush    { 0% { transform: none } 50% { transform: translate(22px,-10px) } 100% { transform: none } }
@keyframes appuPop     { from { transform: scale(0.4); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes appuThink   { 0%,100% { opacity: .25; transform: translateY(6px) } 50% { opacity: 1; transform: none } }

/* ⚠️ ONLY THE DRAWING IS CLICKABLE. A host that makes him a control sets pointer-events none on
   the control's own box; none here and auto on the SHAPES then hit-tests the painted geometry, so
   the empty corners of his frame stay transparent to clicks and the canvas underneath keeps
   working. It has to be per-shape: pointer-events inherits, so none on the button alone left the
   shapes inheriting none and the svg box still swallowing the corner — measured, not assumed.
   ⚠️ NO BACKTICKS IN THIS BLOCK. It sits inside a template literal, so one closes the CSS string
   and the whole file stops parsing — and the tests stay green while it happens, because they
   render him, not this stylesheet. Second time; the first cost a confusing half-hour. */
.appu-root  { animation: appuRise 420ms cubic-bezier(.34,1.3,.5,1) both; pointer-events: none; }
.appu-root path, .appu-root circle, .appu-root ellipse { pointer-events: auto; }
.appu-body  { animation: appuBreathe 3.6s ease-in-out infinite; transform-origin: 200px 480px; }
.appu-eyes  { animation: appuBlink 5.2s infinite; transform-origin: 200px 275px; }

/* ⚠️ ONLY THESE TWO LOOP. Work is still happening and the loop is the message; everything else
   plays once and settles, because a character churning in the corner of a screen somebody is
   working on becomes something to resent within a day. */
.appu-thinking .appu-act      { animation: appuTap 1.1s ease-in-out infinite; transform-origin: 380px 440px; }
.appu-thinking_long .appu-act { animation: appuScratch 620ms ease-in-out infinite; transform-origin: 380px 442px; }
.appu-thinking .appu-dots circle,
.appu-thinking_long .appu-dots circle { animation: appuThink 1.4s ease-in-out infinite; }
.appu-thinking .appu-dots circle:last-child,
.appu-thinking_long .appu-dots circle:last-child { animation-delay: .35s; }

.appu-answered  .appu-act { animation: appuWave 760ms ease-in-out 2; transform-origin: 384px 442px; }
.appu-empty     .appu-act { animation: appuShrug 520ms ease-out both; }
.appu-declined  .appu-act { animation: appuNo 620ms ease-in-out 1; transform-origin: 380px 444px; }
/* ⚠️ BOTH ANIMATIONS, COMMA-SEPARATED. A second animation declaration on .appu-body REPLACES the
   breathing, so a shake alone left him frozen the moment it finished — permanently still, in the
   one state where looking inert is worst. */
.appu-failed    .appu-body { animation: appuShake 420ms ease-in-out 2, appuBreathe 3.6s ease-in-out infinite; }
.appu-escalated .appu-act { animation: appuPush 620ms ease-out 1; }
.appu-marks               { animation: appuPop 360ms cubic-bezier(.34,1.5,.5,1) both; }

/* ⚠️ STOPPED, NOT SOFTENED. Every pose is drawn to read as a still. */
@media (prefers-reduced-motion: reduce) {
  .appu-root, .appu-body, .appu-eyes, .appu-act, .appu-marks, .appu-dots circle { animation: none !important; }
}`;

/* ⚠️ A FULL FIGURE NEEDS ~96px. Measured: below that the arms, the line and the hair gaps turn to
   mush and all nine states look alike. The head alone still reads at 26, so a small mount gets the
   head CROP of the same drawing rather than a second, simpler drawing of him — one geometry, two
   framings, so a change to his face cannot reach one size and miss the other. */
const FRAME = {
  full: { box: '-16 46 450 460', x0: -16, w: 450, h: 460 },
  head: { box: '40 110 316 345', x0: 40, w: 316, h: 345 },
};

/**
 * @param state  one of ASSISTANT (see assistantState.js)
 * @param size   rendered height in px. Measured: NINE poses stop being distinguishable from one
 *               another below ~96; a single pose on its own still reads at 68.
 * @param crop   'full' (default) or 'head' — use 'head' under ~96px. See FRAME.
 * @param facing 'left' (default) or 'right'. See FACING.
 * @param apron  the collar under his chin. The baker's own primary where a host has one.
 */
export default function Appu({
  state = ASSISTANT.IDLE, size = 64, crop = 'full', facing = 'left', apron = SAGE,
}) {
  const pose = POSE[state] ?? POSE[ASSISTANT.IDLE];
  const frame = FRAME[crop] ?? FRAME.full;
  /* ⚠️ HE LOOKS INTO THE SCREEN. Sandeep: *"since this image goes on the right side bottom on the
     desktop, it should be looking to left side"*. The reference faces right because it is a
     standalone sticker; sitting in the bottom-right corner, facing right means facing out of the
     window, away from everything the baker is working on. Mirroring the whole group is the one
     change, so the geometry stays checkable against the reference exactly as traced. */
  const mirror = facing === 'left' ? `translate(${2 * frame.x0 + frame.w} 0) scale(-1 1)` : undefined;
  const id = useId();
  return (
    <svg viewBox={frame.box} height={size} width={size * frame.w / frame.h} aria-hidden="true"
         focusable="false" className={`appu-root appu-${state}`} fill="none" stroke={INK}
         strokeLinecap="round" strokeLinejoin="round" key={`${id}-${state}`}>
      <style>{CSS}</style>
      <g transform={mirror}>
      {/* ⚠️ THE TRACED HEAD IS AN EGG, AND SANDEEP ASKED FOR A CIRCLE. Measured off the traced path
          it is 280 wide by 298 tall — 6.4% taller than wide, which is small enough to look like a
          mistake rather than a style. 298/280 = 1.064 horizontally about the head's centre x=198
          makes it round. This is the ONE place we knowingly depart from the reference.
          ⚠️ It wraps EVERYTHING, so the eyes, mouth and blush stretch with the skull and stay in
          register. Applied to the body path alone, the face would sit in the wrong place. The
          ground line and hands widen 6.4% too, which at this size is invisible. */}
      <g transform="translate(198 0) scale(1.064 1) translate(-198 0)">
      <g className="appu-body">
        {/* ⚠️ A WHITE FACE BEHIND THE TRACE. The traced shape is ink only — its face is a hole, so
            on anything but a white page he would be see-through. Kept inside the outline (the head
            measures x 57..338, y 142..440) so no white shows outside him. */}
        <ellipse cx="197" cy="291" rx="130" ry="138" fill="#fff" stroke="none" />
        <path d={BODY} fill={INK} fillRule="nonzero" stroke="none" />
        {/* The cowlick traced as its own component, so it is drawn rather than part of BODY. */}
        <path d="M221 180 C228 166 242 166 248 178" strokeWidth="7" />
        {/* ⚠️ THE COLLAR IS IN THE TRACE ALREADY — its gaps between the arms ARE the straps. Drawing
            our own sage bars on top of them made a picket fence. `apron` tints that gap instead. */}
        <path d="M178 450 H214 V468 H178 z" fill={apron} stroke="none" opacity="0.85" />
        <ellipse cx="129" cy="345" rx="16" ry="18" fill={BLUSH} stroke="none" />
        <ellipse cx="284" cy="271" rx="16" ry="18" fill={BLUSH} stroke="none" />
        {BROW[pose.brow]}
        <g className="appu-eyes">{EYES[pose.eyes]}</g>
        {MOUTH[pose.mouth]}
        {GESTURE[pose.gesture]}
      </g>
      {MARKS[state] ?? null}
      </g>
      </g>
    </svg>
  );
}
