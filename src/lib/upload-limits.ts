/**
 * The largest single file the app accepts through a form. It sits under both limits that apply:
 * the Next.js server-action body limit (`experimental.serverActions.bodySizeLimit` in
 * next.config.ts, which must stay at least this big, since the default is only 1MB) and Vercel's
 * 4.5MB request cap. One constant so the form message, the server check and the storage bucket
 * can never disagree.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "4MB";
