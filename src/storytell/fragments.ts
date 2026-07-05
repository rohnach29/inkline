import type { StoryEventType } from "../analyze/types";

/**
 * The couplet library — the product.
 *
 * Every entry is two lines that rhyme by construction, written in Shel
 * Silverstein's register: concrete images, kid-logic, a wry turn, real feeling
 * under the joke. The verse engine picks a couplet per role and fills its
 * {slots}; the tests in verse.test.ts are the editor, enforcing rhyme, scan,
 * and slot honesty over this array.
 *
 * A couplet may serve several event types via `kinds`; a "quiet" or
 * "triumphant" mood covers more ground than any single event. `data` couplets
 * carry the number slots; `open` and `close` couplets never do.
 */

export type Mood =
  | "triumphant"
  | "sheepish"
  | "nocturnal"
  | "quiet"
  | "absurd"
  | "steady";

export interface Couplet {
  /** line 1 — may contain {slot} tokens (data role only) */
  a: string;
  /** line 2 — rhymes with line 1 */
  b: string;
  mood: Mood;
  /** event types this couplet suits ("*" not allowed; list them) */
  kinds: readonly StoryEventType[];
  role: "open" | "data" | "close";
}

export const COUPLETS: readonly Couplet[] = [
  // ---------------------------------------------------------------- OPEN ----
  {
    a: "The morning laced its shoes before the sun,",
    b: "and asked the road what needed to be done.",
    mood: "steady",
    kinds: ["first-run", "longest-run", "month", "streak"],
    role: "open",
  },
  {
    a: "The very first step doesn't know its name.",
    b: "It thinks that every morning runs the same.",
    mood: "quiet",
    kinds: ["first-run", "last-run"],
    role: "open",
  },
  {
    a: "The last run tiptoed out and shut the gate,",
    b: "and left the year to sit alone and wait.",
    mood: "quiet",
    kinds: ["last-run", "ghost-elevation", "quiet"],
    role: "open",
  },
  {
    a: "Some runs go long the way a river goes,",
    b: "past every reason anybody knows.",
    mood: "triumphant",
    kinds: ["longest-run", "journey"],
    role: "open",
  },
  {
    a: "There is a speed that files the world to line,",
    b: "where trees go blur and everything is fine.",
    mood: "triumphant",
    kinds: ["fastest-run"],
    role: "open",
  },
  {
    a: "You found the gear the ordinary hide,",
    b: "and rode it like you had the road for pride.",
    mood: "triumphant",
    kinds: ["fastest-run", "route-champion"],
    role: "open",
  },
  {
    a: "A hill is just the ground that lost its cool,",
    b: "and stood straight up to make you look the fool.",
    mood: "absurd",
    kinds: ["hilliest-run", "hill-beast"],
    role: "open",
  },
  {
    a: "The mountain thought that no one would attend.",
    b: "You climbed it, rude and cheerful, to the end.",
    mood: "triumphant",
    kinds: ["hilliest-run", "hill-beast", "ghost-elevation"],
    role: "open",
  },
  {
    a: "The dawn had not yet learned to be awake,",
    b: "when you went out and beat it to the lake.",
    mood: "nocturnal",
    kinds: ["earliest-run"],
    role: "open",
  },
  {
    a: "You met the morning while it was still gray,",
    b: "before it brushed its teeth and named the day.",
    mood: "nocturnal",
    kinds: ["earliest-run"],
    role: "open",
  },
  {
    a: "The evening kept the porch light on for you,",
    b: "unsure what someone runs at midnight to.",
    mood: "nocturnal",
    kinds: ["latest-run", "night-runs"],
    role: "open",
  },
  {
    a: "The moon came out to check on who was out.",
    b: "It found you, and it had its lamp about.",
    mood: "nocturnal",
    kinds: ["night-runs", "latest-run"],
    role: "open",
  },
  {
    a: "A run can start out certain of its aim,",
    b: "then lose the thread and wander, feeling shame.",
    mood: "sheepish",
    kinds: ["false-starts"],
    role: "open",
  },
  {
    a: "Not every run agrees to being run.",
    b: "Some sputter out before they've quite begun.",
    mood: "sheepish",
    kinds: ["false-starts", "first-run"],
    role: "open",
  },
  {
    a: "The shoes sat by the door and did not ask.",
    b: "The door knew better than to take them to task.",
    mood: "quiet",
    kinds: ["quiet"],
    role: "open",
  },
  {
    a: "The road forgot the shape you used to trace.",
    b: "It kept your silence like an empty space.",
    mood: "quiet",
    kinds: ["quiet", "ghost-elevation"],
    role: "open",
  },
  {
    a: "A streak is just a stubbornness of days,",
    b: "a habit wearing all its stubborn ways.",
    mood: "steady",
    kinds: ["streak"],
    role: "open",
  },
  {
    a: "Your feet signed on to be a moving van,",
    b: "and drove you further than you had a plan.",
    mood: "absurd",
    kinds: ["journey"],
    role: "open",
  },
  {
    a: "You ran one route until it knew your face,",
    b: "until the pavement kept you like a place.",
    mood: "absurd",
    kinds: ["route-champion"],
    role: "open",
  },
  {
    a: "A month is thirty doors that look the same,",
    b: "and every one of them will learn your name.",
    mood: "absurd",
    kinds: ["month"],
    role: "open",
  },
  {
    a: "The distance did not care that it was far,",
    b: "it simply waited, patient as a star.",
    mood: "steady",
    kinds: ["journey", "longest-run"],
    role: "open",
  },
  {
    a: "The streetlights stood in one long yellow row,",
    b: "and watched a person run where none should go.",
    mood: "nocturnal",
    kinds: ["night-runs"],
    role: "open",
  },
  {
    a: "You beat the birds to their own morning shift,",
    b: "and gave the empty hour a gentle lift.",
    mood: "steady",
    kinds: ["earliest-run"],
    role: "open",
  },
  {
    a: "You meant to run at dawn. You really did.",
    b: "The afternoon just quietly outbid.",
    mood: "sheepish",
    kinds: ["latest-run"],
    role: "open",
  },
  {
    a: "The bed brought up a very solid case,",
    b: "and dawn slipped by without a second's grace.",
    mood: "sheepish",
    kinds: ["latest-run", "false-starts"],
    role: "open",
  },
  {
    a: "The hill had attitude; it thought it'd win.",
    b: "It hadn't met the stubborn you within.",
    mood: "absurd",
    kinds: ["hill-beast", "hilliest-run"],
    role: "open",
  },
  {
    a: "Your legs discovered they could argue back,",
    b: "and told the wind to kindly leave the track.",
    mood: "triumphant",
    kinds: ["fastest-run"],
    role: "open",
  },
  {
    a: "The long way round is still a way to go,",
    b: "and teaches things the short way cannot know.",
    mood: "steady",
    kinds: ["longest-run"],
    role: "open",
  },

  // ---------------------------------------------------------------- DATA ----
  {
    a: "For {days} whole days the pavement went unread,",
    b: "and grass grew tall on every word it said.",
    mood: "quiet",
    kinds: ["quiet"],
    role: "data",
  },
  {
    a: "{km} kilometers — measured, mapped, and true,",
    b: "and every single one of them by you.",
    mood: "triumphant",
    kinds: [
      "longest-run",
      "fastest-run",
      "first-run",
      "last-run",
      "journey",
      "month",
      "route-champion",
    ],
    role: "data",
  },
  {
    a: "{count} runs that ended long before they should,",
    b: "like pencils snapped while writing something good.",
    mood: "sheepish",
    kinds: ["false-starts"],
    role: "data",
  },
  {
    a: "{gain} meters of climb, collected like a debt,",
    b: "and not one summit ready to forget.",
    mood: "triumphant",
    kinds: ["hilliest-run", "hill-beast", "ghost-elevation"],
    role: "data",
  },
  {
    a: "The clock said {time} in a doubtful tone,",
    b: "as if the dark had left you all alone.",
    mood: "nocturnal",
    kinds: ["earliest-run", "latest-run", "night-runs"],
    role: "data",
  },
  {
    a: "{count} separate nights you traded sleep for street,",
    b: "and wore the darkness thin beneath your feet.",
    mood: "nocturnal",
    kinds: ["night-runs"],
    role: "data",
  },
  {
    a: "For {days} days running you refused to break,",
    b: "a chain of dawns you strung for its own sake.",
    mood: "steady",
    kinds: ["streak"],
    role: "data",
  },
  {
    a: "In {month} the calendar began to lean,",
    b: "toward all the quiet distance in between.",
    mood: "steady",
    kinds: ["month"],
    role: "data",
  },
  {
    a: "You held a {pace} and made the mile complain,",
    b: "then dropped it, breathing, somewhere down the lane.",
    mood: "triumphant",
    kinds: ["fastest-run"],
    role: "data",
  },

  // --------------------------------------------------------------- CLOSE ----
  {
    a: "But quiet isn't empty — ask the snow.",
    b: "It's just the road rehearsing where you'll go.",
    mood: "quiet",
    kinds: ["quiet", "ghost-elevation"],
    role: "close",
  },
  {
    a: "So log it, all of it, and don't be coy —",
    b: "the road remembers every honest joy.",
    mood: "triumphant",
    kinds: ["longest-run", "fastest-run", "first-run"],
    role: "close",
  },
  {
    a: "Whatever chased you, you outran the doubt,",
    b: "and that is what the running was about.",
    mood: "triumphant",
    kinds: ["fastest-run", "route-champion", "hill-beast"],
    role: "close",
  },
  {
    a: "The first step's small — that's all a first step knows —",
    b: "but this is where the whole long distance grows.",
    mood: "steady",
    kinds: ["first-run"],
    role: "close",
  },
  {
    a: "The last run isn't sad, it's just a door,",
    b: "and doors are how you find out there's a floor.",
    mood: "quiet",
    kinds: ["last-run", "ghost-elevation"],
    role: "close",
  },
  {
    a: "So close the year the way you'd close a book —",
    b: "with one last fond, unhurried, backward look.",
    mood: "quiet",
    kinds: ["last-run"],
    role: "close",
  },
  {
    a: "The hill is shorter now that you've been up,",
    b: "it lost the argument, and drank the cup.",
    mood: "triumphant",
    kinds: ["hilliest-run", "hill-beast"],
    role: "close",
  },
  {
    a: "You gave the sky some meters it forgot,",
    b: "and pocketed the summit like a thought.",
    mood: "absurd",
    kinds: ["hilliest-run", "hill-beast", "ghost-elevation"],
    role: "close",
  },
  {
    a: "The dark and you have got an understanding:",
    b: "you keep it company; it keeps you landing.",
    mood: "nocturnal",
    kinds: ["earliest-run", "latest-run", "night-runs"],
    role: "close",
  },
  {
    a: "The night's not scary once you've made it friend,",
    b: "it walks you home and stays until the end.",
    mood: "nocturnal",
    kinds: ["night-runs", "latest-run"],
    role: "close",
  },
  {
    a: "A false start's still a start, if you are fair —",
    b: "you laced them up; you carried them somewhere.",
    mood: "sheepish",
    kinds: ["false-starts"],
    role: "close",
  },
  {
    a: "Not every plan deserves to come to pass.",
    b: "Forgive the run that stayed home in the grass.",
    mood: "sheepish",
    kinds: ["false-starts", "latest-run"],
    role: "close",
  },
  {
    a: "The streak will break someday; they always do.",
    b: "That doesn't take the walked-out mornings from you.",
    mood: "steady",
    kinds: ["streak"],
    role: "close",
  },
  {
    a: "So count the chain, then let the counting rest —",
    b: "the days you showed up were the days you're best.",
    mood: "steady",
    kinds: ["streak", "month"],
    role: "close",
  },
  {
    a: "Add up your steps; they'd stretch from here to there —",
    b: "a comic, staggering amount of somewhere.",
    mood: "absurd",
    kinds: ["journey"],
    role: "close",
  },
  {
    a: "You went so far the map ran out of ink,",
    b: "and had to stop and take a breath, and think.",
    mood: "absurd",
    kinds: ["journey", "route-champion"],
    role: "close",
  },
  {
    a: "You wore that route so smooth it knew your stride,",
    b: "and took you in the way a home takes pride.",
    mood: "absurd",
    kinds: ["route-champion", "hill-beast"],
    role: "close",
  },
  {
    a: "The month packed up its runs and said goodnight,",
    b: "a small fat folder stuffed with left and right.",
    mood: "absurd",
    kinds: ["month"],
    role: "close",
  },
  {
    a: "The long ones teach a patience of the feet,",
    b: "a lesson only distance can complete.",
    mood: "steady",
    kinds: ["longest-run", "journey"],
    role: "close",
  },
  {
    a: "The stillness kept your shape against the cold,",
    b: "a story that the empty road still told.",
    mood: "quiet",
    kinds: ["quiet"],
    role: "close",
  },
  {
    a: "You caught the day before it was awake,",
    b: "and that's a quiet kind of gift to take.",
    mood: "nocturnal",
    kinds: ["earliest-run"],
    role: "close",
  },
  {
    a: "The map shows climbing where the ground stayed flat —",
    b: "the ghost of hills. There's no real harm in that.",
    mood: "sheepish",
    kinds: ["ghost-elevation", "quiet"],
    role: "close",
  },
  {
    a: "Whatever else the year became or meant,",
    b: "it opened with a single, brave ascent.",
    mood: "steady",
    kinds: ["first-run"],
    role: "close",
  },
  {
    a: "So here's to nights that only you and moon,",
    b: "agreed were worth the aching afternoon.",
    mood: "nocturnal",
    kinds: ["night-runs"],
    role: "close",
  },
  {
    a: "The calendar has proof of who you are —",
    b: "a run of days that stretched from scar to star.",
    mood: "triumphant",
    kinds: ["streak"],
    role: "close",
  },
  {
    a: "And when it ends, it ends the way things must,",
    b: "with gratitude, and one goodbye of dust.",
    mood: "quiet",
    kinds: ["last-run"],
    role: "close",
  },
  {
    a: "You logged enough small circles in one place,",
    b: "to sand a groove clean through the planet's face.",
    mood: "absurd",
    kinds: ["month", "route-champion"],
    role: "close",
  },
];
