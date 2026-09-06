import { Link } from '@/app/Link'
import { Nav } from '@/components/Nav'
import {
  nextProject,
  projectBySlug,
  projectPath,
  type Project,
  type ProjectMedia,
  type ProjectSection,
} from '@/content/projects'
import { siteContent } from '@/content/site'

import styles from './ProjectPage.module.css'

function SectionBlock({ section }: { section: ProjectSection }) {
  return (
    <section className={styles.section}>
      {section.title ? <h2 className={styles.sectionTitle}>{section.title}</h2> : null}
      <div className={styles.sectionBody}>
        {section.highlight ? <p className={styles.highlight}>{section.highlight}</p> : null}
        {section.content?.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {section.steps ? (
          <ol className={styles.steps}>
            {section.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        {section.items ? (
          <ul className={styles.items}>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

function Contribution({ items }: { items: string[] }) {
  const asProse = items.some((item) => item.length > 90)

  if (asProse) {
    return (
      <>
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </>
    )
  }

  return (
    <ul className={styles.contribution}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function MediaFigure({ item }: { item: ProjectMedia }) {
  const media =
    item.kind === 'video' ? (
      <video src={item.src} controls playsInline preload="metadata" />
    ) : (
      <img src={item.src} alt={item.alt} loading="lazy" />
    )

  return (
    <figure className={styles.figure}>
      {item.href ? (
        <a className={styles.mediaLink} href={item.href} target="_blank" rel="noreferrer noopener">
          {media}
        </a>
      ) : (
        media
      )}
      {item.caption ? <figcaption>{item.caption}</figcaption> : null}
    </figure>
  )
}

function Embed({ src, title }: { src: string; title: string }) {
  return (
    <figure className={styles.embed}>
      <iframe src={src} title={title} allow="fullscreen" loading="lazy" />
    </figure>
  )
}

export function ProjectPage({ project }: { project: Project }) {
  const upcoming = nextProject(project.slug)
  const parent = project.under ? projectBySlug(project.under) : undefined
  const meta = [project.type, project.year].filter(Boolean).join(' · ')
  const hasSpec = Boolean(project.kindLabel || project.credit || project.location)
  const showType = Boolean(
    project.type && (!project.kindLabel || project.type !== project.kindLabel),
  )
  const back = parent
    ? { href: projectPath(parent.slug), label: parent.title }
    : { href: '/#projects', label: 'Projects' }

  return (
    <>
      <Nav />
      <main className={styles.page}>
        <Link className={styles.back} href={back.href}>
          <span aria-hidden="true">←</span> {back.label}
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>{project.title}</h1>
          {hasSpec ? (
            <dl className={styles.spec}>
              {project.location ? (
                <div>
                  <dt>Location</dt>
                  <dd>{project.location}</dd>
                </div>
              ) : null}
              {project.credit ? (
                <div>
                  <dt>Role</dt>
                  <dd>{project.credit}</dd>
                </div>
              ) : null}
              {project.kindLabel ? (
                <div>
                  <dt>Project type</dt>
                  <dd>{project.kindLabel}</dd>
                </div>
              ) : null}
              {showType ? (
                <div>
                  <dt>Type</dt>
                  <dd>{project.type}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className={styles.meta}>{meta}</p>
          )}
          {project.tags?.length ? <p className={styles.tags}>{project.tags.join(' · ')}</p> : null}
          {project.collaboration ? (
            <p className={styles.collaboration}>{project.collaboration}</p>
          ) : null}
        </header>

        {project.overview ? <p className={styles.overview}>{project.overview}</p> : null}

        {project.embed ? <Embed src={project.embed.src} title={project.embed.title} /> : null}

        {project.role ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>About the project</h2>
            <div className={styles.sectionBody}>
              <p>{project.role}</p>
            </div>
          </section>
        ) : null}

        {project.contribution?.length ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>My contribution</h2>
            <div className={styles.sectionBody}>
              <Contribution items={project.contribution} />
            </div>
          </section>
        ) : null}

        {project.sections?.map((section) => (
          <SectionBlock key={section.title ?? section.content?.[0]} section={section} />
        ))}

        {project.media?.length ? (
          <div className={styles.media}>
            {project.media.map((item) => (
              <MediaFigure key={item.src} item={item} />
            ))}
          </div>
        ) : null}

        {project.externalLinks?.length ? (
          <ul className={styles.externalLinks}>
            {project.externalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  {link.label} <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {upcoming ? (
          <Link className={styles.next} href={projectPath(upcoming.slug)}>
            <span className={styles.nextLabel}>Next project</span>
            <span className={styles.nextTitle}>
              {upcoming.title} <span aria-hidden="true">→</span>
            </span>
          </Link>
        ) : null}
      </main>
      <footer className={styles.footer}>
        <p>{siteContent.footer.note}</p>
      </footer>
    </>
  )
}
