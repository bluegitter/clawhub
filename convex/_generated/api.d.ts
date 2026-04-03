/* eslint-disable */
/**
 * Minimal Convex API compatibility shim.
 *
 * The self-hosted local backend no longer uses Convex server functions, but
 * parts of the frontend still import `api.*` references. Keep this file as a
 * lightweight typed-any surface so the app can compile while those pages are
 * migrated off Convex hooks.
 */

export declare const api: any;
export declare const internal: any;
export declare const components: any;
