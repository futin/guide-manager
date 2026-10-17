/**
 * Type resolution for `release-kit` under this repo's `moduleResolution: "node"` (node10): the package declares its types only through
 * `package.json#exports`, which node10 ignores, so without this the import is an implicit `any` and `tsc` fails. An ambient shim rather than a
 * `compilerOptions.paths` entry because `nest build` rewrites `paths` into a `require` of a declaration file at runtime; a shim emits nothing, and the
 * runtime `require('release-kit')` still resolves through `exports` (the `require` condition, `dist/cjs`). The same shim backlog-manager carries.
 */
declare module 'release-kit' {
  export * from 'release-kit/dist/esm/index';
}
