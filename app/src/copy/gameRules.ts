/**
 * How the read-in game works in the app — the mechanics, which are the same for
 * every group. The group's own rules (what counts as the mark, when a call is
 * fair) are written by its admins and fetched from the server, read-in only.
 *
 * This has to say what infrastructure/lambda/game-call/logic.ts does. If the
 * rule there changes, change this with it.
 */

export interface RuleSection {
  heading: string;
  body: string;
}

export function builtInRules(game: string): RuleSection[] {
  return [
    {
      heading: 'Stay covered',
      body:
        `Once you're read in, ${game} is always on. Your drink should carry the group's mark — ` +
        'the house rules below say what counts. A drink with the mark is covered.',
    },
    {
      heading: 'Calling it',
      body:
        `Spot someone whose drink isn't covered? Tap Call ${game} on the feed and pick who you're ` +
        'calling out. You can call more than one person at once, but only players who are read in.',
    },
    {
      heading: 'Answering',
      body:
        'Everyone you call answers: covered or not. The caller can also answer for anyone they ' +
        "called — they're usually looking right at the cup. The first answer in sticks.",
    },
    {
      heading: 'Who drinks',
      body:
        'Everyone called who was not covered chugs. If anyone you called was covered, the call ' +
        'backfires and you chug too — alongside anyone who was caught.',
    },
    {
      heading: 'Keep it quiet',
      body:
        "Players who aren't read in see that something happened, never who or what. Don't spoil it for them.",
    },
  ];
}
