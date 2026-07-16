/**
 * Detection of local/workspace/git declared versions that cannot be
 * resolved against the npm registry
 */

const LOCAL_PACKAGE_VERSION_REGEX = /^(file:|link:|workspace:|github:|git\+|git:|https?:|bitbucket:|gitlab:)/i;

export function isLocalPackageVersion(declaredVersion: string): boolean {
  return LOCAL_PACKAGE_VERSION_REGEX.test(declaredVersion);
}
