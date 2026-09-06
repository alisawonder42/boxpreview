import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'project'; slug: string }
  | { name: 'cv' }
  | { name: 'lab' }
  | { name: 'notFound' }

const NAVIGATION_EVENT = 'app:navigate'

export function parseRoute(pathname: string, hash: string): Route {
  // The design lab predates path routing and keeps its hash URL.
  if (hash.replace(/^#\/?/, '').split(/[/?]/)[0] === 'lab') return { name: 'lab' }

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (segments[0] === '') return { name: 'home' }
  if (segments[0] === 'cv') return { name: 'cv' }
  if (segments[0] === 'projects' && segments[1]) return { name: 'project', slug: segments[1] }
  return { name: 'notFound' }
}

function currentRoute(): Route {
  return parseRoute(window.location.pathname, window.location.hash)
}

/**
 * Minimal path routing. The site is small enough that a router dependency would
 * outweigh it, and the Worker already falls back to index.html for unknown
 * paths, so real URLs like /projects/flat resolve on a cold load too.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    const update = () => setRoute(currentRoute())
    window.addEventListener('popstate', update)
    window.addEventListener('hashchange', update)
    window.addEventListener(NAVIGATION_EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('hashchange', update)
      window.removeEventListener(NAVIGATION_EVENT, update)
    }
  }, [])

  return route
}

export function navigate(to: string) {
  const target = new URL(to, window.location.href)
  const samePage =
    target.pathname === window.location.pathname && target.search === window.location.search

  if (!samePage || target.hash !== window.location.hash) {
    window.history.pushState({}, '', target)
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT))

  // pushState does not scroll, so anchors and new pages have to be handled here.
  if (target.hash) {
    scrollToAnchor(decodeURIComponent(target.hash.slice(1)))
  } else if (!samePage) {
    window.scrollTo(0, 0)
  }
}

/**
 * Arriving from another page, the target section does not exist until the home
 * page has rendered, so wait a few frames for it rather than one.
 */
function scrollToAnchor(id: string, attempt = 0) {
  const element = document.getElementById(id)
  if (element) {
    element.scrollIntoView({ block: 'start' })
    return
  }
  if (attempt < 10) requestAnimationFrame(() => scrollToAnchor(id, attempt + 1))
}
