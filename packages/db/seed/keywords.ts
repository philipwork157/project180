// Search words for the starter library: other names and the muscles each exercise works,
// so a search for "hamstrings" or "pelvic floor" finds the right things.

/** [pattern on the exercise name, words to add] — every matching rule adds its words. */
const RULES: Array<[RegExp, string]> = [
  // Legs
  [/leg curl|hamstring|nordic|glute-ham/i, 'hamstrings, hamstring curl, leg curl, back of thigh'],
  [
    /romanian|stiff-leg|good morning|\(hamstring\)/i,
    'hamstrings, glutes, hinge, rdl, posterior chain',
  ],
  [/deadlift|rack pull/i, 'hinge, posterior chain, hamstrings, glutes, lower back'],
  [
    /squat|leg press|lunge|step-up|step-down|leg extension|wall sit|sit-to-stand|knee extension|sled drag/i,
    'quads, quadriceps, thighs, legs',
  ],
  [/calf|tibialis/i, 'calves, calf, lower leg, shins'],
  [
    /hip thrust|glute bridge|bridge|kickback|abduction|clamshell|fire hydrant|donkey kick|frog pump|lateral walk|curtsy|hip extension|side-lying leg raise|pull-through|swing/i,
    'glutes, bum, butt, hips',
  ],
  [/adduction|adductor|copenhagen|cossack|lateral lunge/i, 'adductors, inner thigh, groin'],
  // Upper body
  [
    /bench press|chest(?!-supported)|push-up|fly\b|pec deck|chest dip|weighted dip|svend|floor press|(incline|decline).*press/i,
    'chest, pecs, pectorals, push',
  ],
  [/pullover/i, 'lats, chest, serratus'],
  [/pull-up|chin-up|pulldown|dead hang/i, 'lats, back width, pull, vertical pull'],
  [
    /\brow\b(?!.*upright)|kroc|seal row|meadows|pendlay|t-bar/i,
    'upper back, lats, rhomboids, mid back, pull, horizontal pull',
  ],
  [/shrug/i, 'traps, trapezius, neck, upper back'],
  [
    /shoulder press|overhead press|arnold|push press|landmine press|pike push|handstand/i,
    'shoulders, delts, deltoids, overhead press, push',
  ],
  [/lateral raise|y-raise|upright row/i, 'side delts, lateral delts, shoulders, delts'],
  [/front raise/i, 'front delts, anterior delts, shoulders'],
  [
    /rear delt|reverse pec deck|face pull|pull-apart|y-t-w/i,
    'rear delts, posterior delts, upper back, posture',
  ],
  [/external rotation/i, 'rotator cuff, shoulder health, prehab'],
  [/^(?!.*(leg curl|hamstring|wrist)).*curl/i, 'biceps, bicep curl, arms'],
  [/hammer|reverse curl|zottman/i, 'brachialis, forearms, biceps'],
  [
    /tricep|skull crusher|pushdown|close-grip bench|diamond push|jm press|tate press|bench dip/i,
    'triceps, tricep, arms, push',
  ],
  [/wrist|pinch|roller|farmer|dead hang|plate pinch/i, 'forearms, grip'],
  // Core
  [
    /crunch|sit-up|v-up|leg raise|knee raise|toes-to-bar|flutter|heel tap|hollow|dead bug|rollout|body saw|reverse crunch|mountain climber/i,
    'abs, abdominals, six pack, core',
  ],
  [
    /twist|oblique|side bend|woodchop|chop|landmine rotation|windshield|side plank|suitcase|pallof/i,
    'obliques, rotation, anti-rotation, waist, core',
  ],
  [/plank|bird dog|stir the pot|carry/i, 'core stability, bracing, core'],
  [
    /back extension|hyperextension|superman|reverse hyper/i,
    'lower back, erectors, spinal erectors, posterior chain',
  ],
  // Pelvic floor and deep core
  [
    /pelvic|kegel|transverse|heel slide|knee fallout|toe tap \(lying\)|connection breath|diaphragmatic|happy baby|ball squeeze|adductor ball|squat hold \(relax\)/i,
    'pelvic floor, kegel, kegels, deep core, postpartum, postnatal, pregnancy, prenatal, diastasis, bladder, incontinence, rehab',
  ],
  [/pelvic tilt|dead bug|bird dog|bridge/i, 'deep core, postpartum, rehab'],
  // Whole body and cardio
  [
    /clean|snatch|thruster|burpee|man maker|devil press|squat thrust|wall ball|slam|get-up|tire flip|sandbag|prowler|sled push/i,
    'full body, conditioning, power, explosive',
  ],
  [
    /elliptical|jump rope|jumping jacks|high knees|box jump|battle ropes|shadow boxing|skater|step aerobics|bear crawl|burpee|mountain climber/i,
    'cardio, conditioning, hiit',
  ],
  [/run|jog|treadmill|track/i, 'running, run, cardio'],
  [/bike|cycling|\bride|spin/i, 'cycling, bike, cardio'],
  [/row(ing)? machine|ski erg/i, 'rower, erg, cardio, conditioning'],
  [/swim|pull buoy|css/i, 'swimming, pool, cardio'],
  [
    /strides|fartlek|progression run|race-pace|5 km time trial|track intervals|hill repeats \(run|compromised run/i,
    'running, run, cardio, speed',
  ],
  [/downhill|power hiking|trail hill/i, 'trail running, trail, mountain, hills, cardio'],
  [
    /trainer ride|sweet spot|ftp|vo2|cadence drills|hill repeats \(bike|mountain bike|recovery ride/i,
    'cycling, bike, power, watts, ftp, cardio',
  ],
  [/threshold intervals \(bike|threshold intervals \(run/i, 'threshold, tempo, lactate'],
  [/transition practice|brick/i, 'triathlon, transition, t1, t2'],
  [
    /hyrox|sled pull|sandbag lunges|compromised run|skierg|wall ball|sled push|burpee broad jump|farmer/i,
    'hyrox, functional, race, conditioning',
  ],
  [/board press|pin press|larsen|spoto/i, 'bench press, bench, chest, triceps'],
  [
    /board press|pin press|pin squat|larsen|spoto|paused deadlift|block pull/i,
    'powerlifting, competition lift, lockout, strength',
  ],
  [/walk|hik/i, 'walking, steps, low impact, cardio'],
  [
    /stretch|pose|foam roll|circles|swings|cat-cow|inchworm|world's greatest|release|floss|rock|dislocate|open book|thread the needle|wall slide|wall angel|90\/90|airplane|pry|twist|savasana|dog|salutation|lunge with|knee hug|quad pull|leg swing|carioca|a-skip|butt kicks|swimmer|halo/i,
    'mobility, flexibility, warm-up, cool-down, stretching',
  ],
  [
    /pose|dog|warrior|salutation|savasana|malasana|pigeon|lizard|anjaneyasana|crow|tree|triangle|side angle|legs up the wall|puppy/i,
    'yoga',
  ],
  [
    /hundred|roll-up|single-leg stretch|double-leg stretch|leg circle|teaser|pilates|\bsaw\b|spine stretch|rolling like a ball|reformer|side-lying leg series/i,
    'pilates, core, control',
  ],
  [
    /jump|bound|hop|pogo|plyo|throw|chest pass|hurdle/i,
    'plyometrics, plyo, power, explosive, jumping, athletic',
  ],
  [/forward fold|thoracic|torso|bear hug/i, 'mobility, rotation, flexibility'],
  [
    /l-sit|muscle-up|planche|archer|pseudo|shrimp|pistol|commando|hindu/i,
    'calisthenics, bodyweight, skill',
  ],
  [/trx/i, 'trx, suspension trainer, straps'],
  [/kettlebell/i, 'kettlebell, kb'],
  [/\bband\b|banded|band /i, 'band, resistance band, home'],
  [/smith machine/i, 'smith, smith machine'],
  [
    /straight leg raise|quad set|short arc|knee extension|seated marching|holding support|balance|tandem|side step|standing hip|chin tuck|blade squeeze|pendulum \(|wall walk|doorway row|mcgill|mckenzie|nerve glide|eccentric heel|wrist extension \(|grip squeeze|sit-to-stand|seated knee|seated marching|seated cardio/i,
    'rehab, prehab, physio, seniors, beginners, low impact',
  ],
  [
    /pregnan|postnatal|birthing ball/i,
    'pregnancy, prenatal, postnatal, postpartum, mom, safe, pelvic floor',
  ],
  [
    /sprint|shuttle|agility|cone|ladder|intervals|stair running|boxing|dance|rucking|trail|nordic walking|aqua|kickboard/i,
    'cardio, conditioning, fitness, sport',
  ],
]

/** Extra names people search for, exercise by exercise. */
const EXTRA: Record<string, string> = {
  'Seated Leg Curl': 'seated hamstring curl',
  'Lying Leg Curl': 'prone leg curl, lying hamstring curl',
  'Romanian Deadlift': 'rdl, barbell rdl',
  'Dumbbell Romanian Deadlift': 'db rdl',
  'Single-Leg Romanian Deadlift': 'single leg rdl, sl rdl, balance',
  'Conventional Deadlift': 'deadlift, barbell deadlift',
  'Trap Bar Deadlift': 'hex bar deadlift',
  'Barbell Back Squat': 'back squat, high bar, low bar',
  'Hack Squat': 'machine squat',
  'Bulgarian Split Squat': 'rear foot elevated split squat, rfess, split squat',
  'Barbell Bench Press': 'flat bench, bench',
  'Overhead Press': 'ohp, military press, standing press',
  'Skull Crusher': 'lying tricep extension',
  'Pec Deck': 'machine fly, butterfly',
  'Reverse Pec Deck': 'rear delt machine',
  'Barbell Hip Thrust': 'glute thrust, hip thrust',
  'Kettlebell Swing': 'russian swing, kb swing',
  'Back Extension': 'hyperextension, roman chair',
  'Face Pull': 'rope face pull',
  'Rowing Machine': 'concept2, rower',
  'Treadmill Incline Walk': '12-3-30, incline walking',
  'Assault Bike': 'air bike, echo bike',
  'Stair Climber': 'stairmaster, stepmill',
  'Pelvic Floor Lift (Kegel)': 'kegel squeeze, slow holds, long holds',
  'Pelvic Floor Quick Flicks': 'fast kegels, quick squeezes',
  'Seated Pelvic Floor Lift': 'chair, seated kegel',
  'Sit-to-Stand': 'chair stand, seniors, beginners',
  'Spanish Squat': 'knee pain, patellar tendon',
  'Terminal Knee Extension': 'tke, knee rehab, vmo',
  'Tibialis Raise': 'tib raise, shin',
  'Glute-Ham Raise': 'ghr',
  'Copenhagen Side Plank': 'copenhagen plank',
  'Dead Hang': 'bar hang, shoulder decompression',
  'Chin-Up': 'biceps',
  'Chest Dip': 'dips, triceps',
  'Weighted Dip': 'dips, triceps',
  'Assisted Dip Machine': 'dips, triceps, chest',
  'Dumbbell Squeeze Press': 'chest, pecs, crush press',
  'Multi-Hip Machine': 'glutes, hip extension, kickback',
  'Dumbbell Step-Over': 'quads, glutes, legs',
  'Hip Hinge Drill (Dowel)': 'hinge, technique, hamstrings, beginners',
}

/** Search words for one exercise: its own extras plus every rule its name matches. */
export function keywordsFor(name: string): string | null {
  const words: string[] = []
  for (const w of (EXTRA[name] ?? '').split(',')) if (w.trim()) words.push(w.trim())
  for (const [pattern, add] of RULES) {
    if (!pattern.test(name)) continue
    for (const w of add.split(',')) if (w.trim() && !words.includes(w.trim())) words.push(w.trim())
  }
  return words.length ? words.join(', ') : null
}
