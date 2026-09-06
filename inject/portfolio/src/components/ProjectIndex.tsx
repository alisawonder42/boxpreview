import { Link } from '@/app/Link'
import { childProjects, projectPath, topLevelProjects } from '@/content/projects'

import styles from './ProjectIndex.module.css'

/**
 * A text-only index. Documentation belongs on the project pages; here the list
 * stays quiet so the sculpture remains the image on the page.
 */
export function ProjectIndex() {
  const listed = topLevelProjects()

  return (
    <ol className={styles.list}>
      {listed.map((project, index) => {
        const children = childProjects(project.slug)
        return (
          <li key={project.slug} className={styles.item}>
            <Link className={styles.row} href={projectPath(project.slug)}>
              <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.body}>
                <span className={styles.title}>{project.title}</span>
                <span className={styles.type}>{project.type}</span>
              </span>
              <span className={styles.arrow} aria-hidden="true">
                ↗
              </span>
            </Link>
            {children.length ? (
              <ol className={styles.children}>
                {children.map((child) => (
                  <li key={child.slug}>
                    <Link className={styles.childRow} href={projectPath(child.slug)}>
                      <span className={styles.childMark} aria-hidden="true">
                        —
                      </span>
                      <span className={styles.body}>
                        <span className={styles.title}>{child.title}</span>
                        <span className={styles.type}>{child.type}</span>
                      </span>
                      <span className={styles.arrow} aria-hidden="true">
                        ↗
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
