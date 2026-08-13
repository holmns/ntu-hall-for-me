/**
 * `<ViewTransition>` ships in the React canary channel, which is the React the
 * App Router actually bundles (`next/dist/compiled/react`), but `@types/react`
 * keeps those declarations in a separate entry point. This reference pulls them
 * in project-wide so `import { ViewTransition } from "react"` type-checks.
 */
/// <reference types="react/canary" />
