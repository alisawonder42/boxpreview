import { Link } from '@/app/Link'
import { projectPath, projects } from '@/content/projects'

import styles from './ProjectIndex.module.css'

/**
 * A text-only index. Documentation belongs on the project pages; here the list
 * stays quiet so the sculpture remains the image on the page.
 */
export function ProjectIndex() {
  return (
    <ol className={styles.list}>
      {projects.map((project, index) => (
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
        </li>
      ))}
    </ol>
  )
}
