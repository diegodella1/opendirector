import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Guide | OpenDirector',
  description: 'Detailed user and operations guide for OpenDirector',
};

type GuideSection = {
  id: string;
  title: string;
  intro?: string;
  body?: string[];
  bullets?: string[];
  numbered?: string[];
  diagram?: string;
  callout?: string;
};

const quickChecklist = [
  'Create or clone the correct show for the day.',
  'Review show settings, especially the vMix host and port.',
  'Build the rundown: blocks, scripts, elements, timings, notes.',
  'Open the Automator on the operator machine and verify connectivity.',
  'Load the prompter on the final talent device and test scroll behavior.',
  'Run a rehearsal or ready-state check before switching the show to live.',
];

const screenCards = [
  {
    title: 'Home',
    description: 'Create a blank show, create a show from a template, save templates, and open existing productions.',
  },
  {
    title: 'Editor',
    description: 'Build the rundown, write teleprompter copy, arrange blocks, add elements, and manage graphics templates.',
  },
  {
    title: 'Go Live',
    description: 'Operate the active show with clocks, block navigation, status changes, signals, and execution visibility.',
  },
  {
    title: 'Prompter',
    description: 'Read the script in a presenter-friendly layout with mirror, fullscreen, scroll speed, and signal support.',
  },
  {
    title: 'Automator',
    description: 'Connect to OpenDirector and vMix, then execute the rundown from the operator workstation.',
  },
];

const sections: GuideSection[] = [
  {
    id: 'overview',
    title: '1. System Overview',
    intro: 'OpenDirector separates editorial work, technical execution, and on-air reading into distinct views so each role can focus on one job without stepping on the others.',
    body: [
      'In a typical workflow, the producer builds the show in the web app, the technical operator runs the show through the Automator, and the presenter or anchor reads from the Prompter view.',
      'The platform is built around a show record. Every show contains its own rundown, show configuration, graphics template data, and prompter configuration.',
    ],
    bullets: [
      'Producer workflow: Home, Editor, Go Live.',
      'Operator workflow: Automator plus Go Live supervision when needed.',
      'Talent workflow: Prompter only.',
      'Technical control point: vMix is not operated directly by the web app; it is driven through the Automator.',
    ],
    diagram: String.raw`Producer ───────────────► OpenDirector Web App
                                   │
                                   │ rundown / config / signals
                                   ▼
Operator ─► Automator ───────────► OpenDirector Server ───────────► vMix
                                   │
                                   │ script / signal / scroll sync
                                   ▼
Talent ─────────────────────────► Prompter`,
    callout: 'The web app stores show data and operating intent. The Automator is the component that performs live execution against vMix.',
  },
  {
    id: 'screens',
    title: '2. Screen Map',
    intro: 'These are the screens you will use during a normal production cycle.',
  },
  {
    id: 'create-show',
    title: '3. Creating a Show',
    intro: 'The home page is the entry point for production planning. Every episode, rundown, or live program starts here.',
    body: [
      'Use the text field to enter the show name. This should identify the specific production instance, not just the general format. For example, use "Morning Update - 2026-04-20" rather than only "Morning Update".',
      'If you want a clean start, leave the template selector on the blank option. If you want to reuse a known structure, pick an existing template first and then create the show.',
    ],
    numbered: [
      'Open the home page.',
      'Enter the new show name.',
      'Choose either a blank show or a source template.',
      'Click `New Show`.',
      'Open the newly created show in `Edit` if you need to build or modify the rundown.',
      'Open `Go Live` only when you are ready to monitor or operate the running show.',
    ],
    bullets: [
      'Blank show: creates an empty production shell with default show config and default prompter config.',
      'From template: clones the structure of a previously saved template into a fresh show.',
      'Save as template: turns an existing show into a reusable starting point for future productions.',
    ],
    callout: 'When a show is created, OpenDirector also creates its base show configuration and prompter configuration automatically.',
  },
  {
    id: 'show-lifecycle',
    title: '4. Show Lifecycle and Statuses',
    intro: 'Statuses are not just labels. They define how safely the show can be edited and how the team should treat that production in real time.',
    bullets: [
      'draft: planning and heavy editing stage. Use this for building the rundown and changing structure.',
      'ready: the show is configured and prepared for a controlled run or stand-by state.',
      'rehearsal: the show is being tested in a realistic execution context, but it is not on air.',
      'live: the show is on air. Structural changes are restricted to reduce operational risk.',
      'archived: the show has been closed out and is no longer active.',
    ],
    diagram: String.raw`draft  ──►  ready  ──►  rehearsal  ──►  live  ──►  archived
  │          │            │             │
  └──────────┴────────────┴─────────────┘
         revise as needed before air`,
    callout: 'While a show is live, OpenDirector intentionally limits structural edits. Scripts and notes remain the safe place for last-second changes.',
  },
  {
    id: 'editor',
    title: '5. Editor: Building the Rundown',
    intro: 'The Editor is the producer’s main workspace. This is where the structure of the show is created and maintained.',
    body: [
      'The left side contains the rundown at block level. Blocks can be added, selected, deleted, and reordered. The selected block opens on the right for detailed editing.',
      'The right side is where scripts, elements, and graphics templates are managed. The editor also shows the live lock banner when the show is on air.',
    ],
    bullets: [
      'Block: a major segment of the show, such as Intro, Headlines, Interview, Break, or Close.',
      'Script: the teleprompter text associated with the selected block.',
      'Elements: the individual items inside a block, such as clips, lower thirds, graphics, audio cues, or notes.',
      'GT Templates: reusable graphics template definitions available for lower third and title workflows.',
      'Notes and script remain editable even when the show is live; structural edits do not.',
    ],
    diagram: String.raw`Show
└── Block 01: Open
    ├── Script for talent
    ├── Element A: lower third
    ├── Element B: video clip
    └── Element C: note

└── Block 02: Interview
    ├── Script for host
    ├── Element A: guest lower third
    └── Element B: bumper`,
  },
  {
    id: 'blocks-elements',
    title: '6. Blocks, Scripts, and Elements',
    intro: 'OpenDirector works best when the rundown is structured consistently. This section defines what each object is supposed to represent.',
    body: [
      'A block is the editorial container. If the team refers to a part of the program as a segment, that should usually be a block.',
      'An element is the operational item. If something has to be called, triggered, shown, or executed, it usually belongs as an element inside a block.',
      'A script is what the talent sees in the Prompter. It is not the same thing as internal notes. Scripts should read naturally for the presenter, while notes can remain technical.',
    ],
    bullets: [
      'Use one block per meaningful segment rather than stuffing the entire show into one giant block.',
      'Use scripts for anchor copy, spoken transitions, timing bridges, and presenter cues.',
      'Use elements for machine-executable items or production markers.',
      'Use notes for internal operator and producer reminders that are not meant for talent reading.',
    ],
    callout: 'A clean rundown is easier to operate than a clever one. Prefer obvious structure over over-compression.',
  },
  {
    id: 'script-format',
    title: '7. Writing Teleprompter Copy',
    intro: 'The Prompter view renders block scripts, so script quality directly affects on-air readability.',
    body: [
      'Write in short spoken phrases rather than print-style paragraphs. Presenters read for rhythm and pace, not for literary density.',
      'The editor hints at a few useful conventions: `[PAUSE]` for a visual pause, `[VTR: name]` for media references, `**bold**` for emphasis, and `(instruction)` for internal direction.',
    ],
    bullets: [
      'Use one idea per line when possible.',
      'Keep pronunciation-sensitive names and acronyms explicit.',
      'Mark transitions clearly before clips, graphics, or guest intros.',
      'Reserve technical details for notes unless the talent must read them.',
    ],
    diagram: String.raw`GOOD
Welcome back.
Tonight's lead story is the mayoral vote.
[PAUSE]
Coming up next, we go live to the field team.

RISKY
Welcome back tonight's lead story is the mayoral vote and after that we might go to the field if the clip is ready...`,
  },
  {
    id: 'graphics-media',
    title: '8. Graphics, Media, People, and Templates',
    intro: 'The production data around the rundown matters almost as much as the rundown itself.',
    bullets: [
      'Media: use this area for clips, audio, and other referenced assets tied to the show.',
      'People: store presenter, guest, or contributor details that support consistent naming and operational accuracy.',
      'GT Templates: define editable graphics patterns so repeated lower thirds or title cards do not need to be recreated manually every time.',
      'Templates at show level: save an entire show structure for repeatable formats such as daily news, weekly magazines, or recurring live streams.',
    ],
    body: [
      'A template should encode the recurring logic of the show, not the date-specific facts. Keep the structure reusable and the content replaceable.',
    ],
  },
  {
    id: 'vmix-config',
    title: '9. vMix Configuration',
    intro: 'This is the most common point of confusion, so it needs to be explicit: OpenDirector stores vMix connection parameters with the show, but the actual connection and execution are performed by the Automator.',
    body: [
      'Show configuration usually includes `vmix_host` and `vmix_port`. These values should identify the vMix instance that will actually receive commands during operation.',
      'On a single-machine setup, `127.0.0.1` and port `8099` are typical. On a multi-machine setup, use the reachable IP address or hostname of the operator machine running vMix.',
    ],
    bullets: [
      'If vMix runs on the same machine as the Automator, use `127.0.0.1:8099` unless your environment is customized.',
      'If vMix runs on another machine, use that machine’s LAN IP or resolvable hostname and confirm firewall access.',
      'The show config and the Automator settings should point to the same target.',
      'Before going live, verify that the expected vMix inputs exist and match the operator plan.',
    ],
    diagram: String.raw`Show Config
  vmix_host = 10.0.0.25
  vmix_port = 8099
        │
        ▼
Automator connects to 10.0.0.25:8099
        │
        ▼
vMix receives commands`,
    callout: 'If the web app looks healthy but nothing happens in vMix, troubleshoot the Automator connection path first.',
  },
  {
    id: 'automator',
    title: '10. Automator Setup and Operation',
    intro: 'The Automator is the operator-facing runtime tool. Its job is to connect to the OpenDirector server, connect to vMix, and execute the show in sync with the rundown.',
    bullets: [
      'Server URL: the published OpenDirector base URL that the Automator should connect to.',
      'vMix Host: where vMix is reachable from the operator workstation.',
      'vMix Port: typically `8099`.',
      'Preflight checks: validate these before air, not during air.',
    ],
    numbered: [
      'Open the Automator on the operator machine.',
      'Enter the OpenDirector server URL.',
      'Enter the vMix host and port.',
      'Connect and verify that the Automator reports a healthy connection.',
      'Load the target show and confirm the expected rundown is present.',
      'Test one or two harmless execution paths before the final live transition.',
    ],
    callout: 'A successful web login does not prove that live execution is ready. Only the Automator-to-vMix path proves execution readiness.',
  },
  {
    id: 'go-live',
    title: '11. Go Live View',
    intro: 'Go Live is the run-of-show monitor and control surface for the active production.',
    body: [
      'This view exposes block order, current block, previous and next navigation, elapsed and remaining timers, block over/under indicators, connectivity state, and Automator mode.',
      'It is the correct place to supervise the current on-air position and to send show-level signals such as countdown, standby, wrap, stretch, or go.',
    ],
    bullets: [
      'Show timer: elapsed time since the show was started.',
      'Block timer: elapsed and remaining time for the active block.',
      'Show left: estimated time left in the whole rundown.',
      'Automator state: shows whether the runtime execution layer is connected and whether it is in auto or manual mode.',
      'Keyboard shortcuts and fast navigation are designed for operation under pressure, so rehearse with this screen before air.',
    ],
    diagram: String.raw`[Prev Block]  [Current Block]  [Next Block]
     │              │               │
     └──── producer/operator follows timing and transitions ────► on-air output`,
  },
  {
    id: 'prompter',
    title: '12. Prompter View',
    intro: 'The Prompter is the talent-facing reading surface. It is intentionally simplified so the presenter can focus on delivery instead of controls.',
    body: [
      'The Prompter reads block scripts from the show rundown and supports fullscreen, mirror mode, adjustable font size, variable scroll speed, and signal overlays.',
      'It also caches scripts locally so the talent does not lose all visible content if connectivity drops temporarily after initial load.',
    ],
    bullets: [
      'Use mirror mode for reflective teleprompter glass setups.',
      'Use fullscreen on the final output device whenever possible.',
      'Use scroll sync if you need one master prompter source and one or more follower displays.',
      'Signals such as countdown, wrap, stretch, standby, and go appear directly in the Prompter view.',
    ],
    callout: 'If the Prompter opens but appears empty, first check whether the active blocks actually contain script text.',
  },
  {
    id: 'templates',
    title: '13. Working with Templates',
    intro: 'Templates reduce setup time and improve consistency for recurring productions.',
    body: [
      'Save a show as a template once the structure is mature and reliable. Then use that template as the starting point for future instances of the same format.',
      'Templates are ideal for fixed-segment programs such as daily news, sports updates, recurring interview formats, and scheduled live streams with repeating control logic.',
    ],
    bullets: [
      'Use templates for structure, not date-specific content.',
      'Review inherited scripts and graphics before going live with a cloned show.',
      'Retire outdated templates when the operational format changes significantly.',
    ],
  },
  {
    id: 'sop',
    title: '14. Recommended Standard Operating Procedure',
    intro: 'The safest way to run OpenDirector is to treat it like a production checklist, not just a content editor.',
    numbered: [
      'Create the show or clone it from the correct template.',
      'Review the show name, date, and technical configuration.',
      'Build the rundown block by block.',
      'Write or update teleprompter copy for each scripted block.',
      'Add and verify all needed elements, notes, graphics references, and timing assumptions.',
      'Check `vmix_host` and `vmix_port` against the real operator environment.',
      'Open the Automator and verify server connectivity plus vMix connectivity.',
      'Open the Prompter on the final device and confirm text, font size, mirror mode, and scroll behavior.',
      'Run a rehearsal or controlled ready-state pass.',
      'Move to `live` only after both editorial and technical checks are complete.',
    ],
    diagram: String.raw`Plan ─► Build ─► Verify ─► Rehearse ─► Go Live ─► Close Out
  │        │         │          │          │
  │        │         │          │          └─ minimize structural changes
  │        │         │          └─ test timing and execution path
  │        │         └─ validate config and connectivity
  │        └─ create rundown and scripts
  └─ create or clone the show`,
    callout: 'Do not use the live state as your first systems test.',
  },
  {
    id: 'troubleshooting',
    title: '15. Troubleshooting',
    intro: 'Most failures fall into one of four categories: data, connectivity, runtime execution, or operator expectation mismatch.',
    bullets: [
      'Cannot create new shows: verify backend health, database availability, and API responses.',
      'Show list loads but create requests fail: inspect the `/api/shows` response and server logs.',
      'Prompter is blank: confirm that the selected blocks contain script text and that the rundown endpoint returns data.',
      'Prompter is stale: reload the page, verify WebSocket connectivity, and confirm the show data changed upstream.',
      'Automator connects to the server but nothing happens in vMix: verify the vMix host, port, API availability, and input naming assumptions.',
      'Cannot make structural edits: confirm the show is not currently in `live` state.',
      'Execution feels inconsistent between devices: verify that all users are on the same published base URL and the same show instance.',
    ],
    callout: 'When debugging, separate the problem into layers: web app, API, Automator, vMix, and Prompter. Do not treat them as one black box.',
  },
];

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-od-bg text-od-text">
      <div className="border-b border-od-surface-light bg-[radial-gradient(circle_at_top,_rgba(74,158,255,0.16),_transparent_44%),linear-gradient(180deg,_rgba(31,52,96,0.24),_transparent)]">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-14">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-od-accent">User Guide</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-white lg:text-5xl">OpenDirector Operations Manual</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-od-text-dim lg:text-lg">
                Detailed operating documentation for producers, operators, and talent. This guide explains what each screen is for,
                how to create and run shows, how vMix fits into the chain, and how to operate the platform without guesswork.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/"
                className="rounded-lg border border-od-surface-light bg-od-surface px-4 py-2 text-sm text-od-text transition-colors hover:border-od-accent/50 hover:text-white"
              >
                Back to OpenDirector
              </Link>
              <Link
                href="/download"
                className="rounded-lg bg-od-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Download Automator
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-od-surface-light lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:border-b-0 lg:border-r lg:bg-od-bg/95 lg:backdrop-blur">
          <nav className="px-6 py-6 lg:px-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-od-text-dim">Contents</p>
            <div className="space-y-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-od-text-dim transition-colors hover:bg-od-surface hover:text-white"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-6 py-8 lg:px-12 lg:py-10">
          <section className="mb-8 rounded-2xl border border-od-surface-light bg-od-surface/60 p-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold text-white">Quick Start Checklist</h2>
                <p className="mt-2 text-sm leading-6 text-od-text-dim">
                  If you only have a minute before a handoff, this is the minimum sequence that should be completed before air.
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100/90 xl:max-w-sm">
                OpenDirector is safest when editorial prep, technical validation, and live execution are treated as separate steps.
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {quickChecklist.map((item) => (
                <div key={item} className="rounded-lg border border-od-surface-light bg-od-bg/40 px-4 py-3 text-sm text-od-text">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {screenCards.map((card) => (
              <div key={card.title} className="rounded-2xl border border-od-surface-light bg-od-surface/35 p-5">
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-od-text-dim">{card.description}</p>
              </div>
            ))}
          </section>

          <div className="space-y-12">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-8">
                <div className="border-b border-od-surface-light pb-3">
                  <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
                  {section.intro && <p className="mt-3 max-w-4xl text-[15px] leading-7 text-od-text-dim">{section.intro}</p>}
                </div>

                {section.body && (
                  <div className="mt-5 space-y-3 text-[15px] leading-7 text-od-text-dim">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                )}

                {section.bullets && (
                  <ul className="mt-5 grid gap-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="rounded-xl border border-od-surface-light bg-od-surface/30 px-4 py-3 text-[15px] leading-7 text-od-text-dim">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}

                {section.numbered && (
                  <ol className="mt-5 space-y-3">
                    {section.numbered.map((step, index) => (
                      <li key={step} className="flex gap-4 rounded-xl border border-od-surface-light bg-od-surface/30 p-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-od-accent/15 text-sm font-semibold text-od-accent">
                          {index + 1}
                        </div>
                        <p className="text-[15px] leading-7 text-od-text-dim">{step}</p>
                      </li>
                    ))}
                  </ol>
                )}

                {section.diagram && (
                  <div className="mt-5 overflow-x-auto rounded-2xl border border-od-surface-light bg-od-bg-dark/80 p-5">
                    <pre className="font-mono text-xs leading-6 text-od-text sm:text-sm">{section.diagram}</pre>
                  </div>
                )}

                {section.callout && (
                  <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/8 px-5 py-4 text-sm leading-7 text-blue-100/85">
                    {section.callout}
                  </div>
                )}
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
