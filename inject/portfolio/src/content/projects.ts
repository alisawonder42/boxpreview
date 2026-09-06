/**
 * Project and experiment content.
 *
 * Everything here is either supplied directly or already established elsewhere
 * in the site. Nothing is inferred: where a fact is not known — a year, a
 * collaborator, a piece of technology — the field is left out rather than
 * guessed, so an empty field always means "still to be supplied" and never
 * "invented". For work made by others, `role` describes the project and
 * `contribution` describes only what Katarina did.
 */

export interface ProjectSection {
  title?: string
  /** Body paragraphs. */
  content?: string[]
  /** An ordered flow, rendered as a numbered list. */
  steps?: string[]
  /** An unordered list of concrete elements. */
  items?: string[]
  /** A single line set apart from the body. */
  highlight?: string
}

export type ProjectMediaKind = 'image' | 'video' | 'diagram'

export interface ProjectMedia {
  kind: ProjectMediaKind
  src: string
  alt: string
  caption?: string
  /** If set, the image or video opens this URL in a new tab. */
  href?: string
}

export interface ProjectLink {
  label: string
  href: string
}

export interface ProjectEmbed {
  src: string
  title: string
}

export interface Project {
  slug: string
  title: string
  /** Shown under the title on the index and on the project page. */
  type: string
  year?: string
  /** Secondary descriptors, joined with a separator. Not shown on the index. */
  tags?: string[]
  /** Independent work, or a contribution to someone else's project. */
  kind: 'independent' | 'professional'
  /** Opening paragraph of the project page. */
  overview?: string
  /** What the project is, for work authored by others. */
  role?: string
  /** Shown as Role on the project page, e.g. Freelance Unity Developer. */
  credit?: string
  /** Shown as Location on the project page. */
  location?: string
  /** Shown as Project type when it differs from the homepage `type` line. */
  kindLabel?: string
  /** Credit line under the spec, e.g. a collaboration. */
  collaboration?: string
  /** Only what Katarina did. */
  contribution?: string[]
  sections?: ProjectSection[]
  /** Documentation lives on the project page, never on the homepage. */
  media?: ProjectMedia[]
  /** Interactive piece, rendered on the project page. */
  embed?: ProjectEmbed
  externalLinks?: ProjectLink[]
}

export const projects: Project[] = [
  {
    slug: 'flat',
    title: 'FLAT',
    type: 'Interactive Gallery Installation / Generative AI',
    kindLabel: 'Interactive Gallery Installation / Generative AI',
    kind: 'independent',
    collaboration: 'Created in collaboration with painter Mladen Ilić',
    overview:
      'FLAT is a gallery installation exploring the distance between a physical artwork and its digital interpretation through human perception and generative AI.',
    sections: [
      {
        content: [
          'Visitors scan a QR code and describe the physical painting from their phones. The AI never sees the original work, it receives only the visitor’s description and generates a new interpretation, which is automatically displayed on one of nine tablets beside the painting.',
          'I designed and developed the technical system: the mobile web interface, generative pipeline, backend and Android kiosk app controlling the gallery displays. The system uses React/Vite, Supabase, OpenAI Image API and Capacitor, and was developed with coding agents.',
        ],
      },
    ],
    media: [
      {
        kind: 'image',
        src: '/projects/flat/installation.gif',
        alt: 'FLAT in a gallery: a square painting on the left and a three-by-three grid of portrait tablets on the right.',
      },
    ],
  },
  {
    slug: 'box',
    title: 'Box',
    type: 'Interactive 3D / Photogrammetry',
    kindLabel: 'Interactive 3D / Photogrammetry',
    kind: 'independent',
    overview: 'A scanned ornamental box. Drag to turn it. Click, and it forgets that it is solid.',
    sections: [
      {
        content: [
          'The object is a photogrammetry scan of a real box. The animal print stays on the surface while it slumps, flattens, and drains off the stand.',
          'Built in vanilla Three.js so it can sit on its own or inside this site.',
        ],
      },
    ],
    embed: {
      src: '/box/index.html?embed=1',
      title: 'The box',
    },
  },
  {
    slug: 'shrinkme',
    title: 'ShrinkMe',
    type: 'AR / AI Interactive Prototype',
    kindLabel: 'AR / AI Interactive Prototype',
    kind: 'independent',
    overview:
      'ShrinkMe is a small AR experiment I built as a playful parody of wellness and therapy apps, using sarcastic virtual therapists instead of reassuring ones.',
    sections: [
      {
        content: [
          'Built in Unity with AR Foundation, the prototype lets users place virtual therapist characters into their surroundings, speak to them through a microphone, and receive generated spoken responses. The characters were intentionally designed to be dry, sarcastic, and slightly unhelpful, turning the familiar wellness-app interaction into something more absurd.',
          'The project combines voice input, generative AI, AR interaction, and Mixamo character animation into a single realtime experience.',
          'It was a rapid experiment in conversational character design and in how AI-driven interactions can feel when they move out of a traditional chat interface and into physical space.',
        ],
      },
    ],
    media: [
      {
        kind: 'image',
        src: '/projects/shrinkme/logo.png',
        alt: 'ShrinkMe logo: a cartoon therapist crouched inside a wireframe cube, with the words SHRINK ME underneath.',
      },
      {
        kind: 'image',
        src: '/projects/shrinkme/ar-mockup.png',
        alt: 'Phone mockup of ShrinkMe: a virtual therapist character standing on a picnic blanket in a park.',
      },
    ],
  },
  {
    slug: 'the-book-of-distance',
    title: 'The Book of Distance',
    type: 'Narrative VR experience',
    kindLabel: 'Virtual Reality',
    credit: 'Freelance Unity Developer',
    kind: 'professional',
    role: 'A narrative VR experience by Randall Okita, produced by the National Film Board of Canada.',
    contribution: [
      'I worked on The Book of Distance during the final stage of development, mainly on performance optimization, bug fixing, and testing.',
      'My work included profiling the experience, investigating performance issues, fixing gameplay and interaction bugs, testing the project across target VR devices, and helping improve overall stability before release.',
      'I worked with the wider development team to help get the project into a solid state for launch on SteamVR and Oculus.',
    ],
    media: [
      {
        kind: 'image',
        src: '/projects/the-book-of-distance/poster.jpg',
        alt: 'Promotional poster for The Book of Distance: a silhouetted figure on a ship looking out over a moonlit sea.',
        href: 'https://www.meta.com/experiences/pcvr/the-book-of-distance/3726132664124874/',
      },
      {
        kind: 'image',
        src: '/projects/the-book-of-distance/still.png',
        alt: 'Still from The Book of Distance: a figure stands in a shadowed room looking out through a circular opening into a garden.',
        href: 'https://www.meta.com/experiences/pcvr/the-book-of-distance/3726132664124874/',
      },
    ],
  },
  {
    slug: 'lilys-garden',
    title: "Lily's Garden",
    type: 'Mobile game',
    kindLabel: 'Live mobile match-3 game',
    credit: 'Gameplay Developer',
    location: 'Copenhagen, Denmark',
    kind: 'professional',
    contribution: [
      'At Tactile, I worked on Lily’s Garden as part of a large live Unity project, with a strong focus on UI, animation, and feature development.',
      'A large part of my work involved building and integrating animated UI and interactive sequences using Unity’s Animator and Timeline, working closely with artists and designers to turn visual ideas into reliable in-game systems.',
      'I also worked within a large existing codebase where clean architecture, maintainability, and unit testing were important parts of development. Alongside feature work, I contributed to internal tools and workflow improvements that made iteration easier across disciplines.',
    ],
    media: [
      {
        kind: 'image',
        src: '/projects/lilys-garden/title.png',
        alt: 'Lily’s Garden title art: the game logo over a painted garden.',
        href: 'https://play.google.com/store/apps/details/Lily_s_Garden?id=dk.tactile.lilysgarden&hl=sr&pli=1',
      },
    ],
  },
]

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug)
}

export function nextProject(slug: string): Project | undefined {
  const index = projects.findIndex((project) => project.slug === slug)
  if (index < 0 || projects.length < 2) return undefined
  return projects[(index + 1) % projects.length]
}

export function projectPath(slug: string): string {
  return `/projects/${slug}`
}

export interface Experiment {
  title: string
  type: string
  note?: string
}

/**
 * Smaller studies, lighter in weight than the project index by design. New
 * entries only need appending here — the section reads straight from this list.
 */
export const experiments: Experiment[] = [
  {
    title: 'Proto',
    type: 'Systems / Architecture Study',
    note: 'A small Unity demo exploring scalable architecture with Zenject, MVC and unit testing. Also used in a teaching context.',
  },
  {
    title: 'Thomas Was Alone — Remake',
    type: 'Early Gameplay Experiment · 2016',
    note: 'A first Unity project, kept as personal history rather than current work.',
  },
  {
    // Working title. The recognition method is deliberately unstated: it has not
    // been confirmed, and naming one would be a guess.
    title: 'Painting AR Experiment',
    type: 'Physical painting / mobile interaction / animation · 2020',
    note: 'A physical painting recognised through a phone, with digital animation connected to the work. An early version of the physical–digital direction that FLAT continues.',
  },
]
