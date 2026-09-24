/**
 * Deploy RCIC sync server to Cloud Run (europe-west1).
 * Requires: Google Cloud SDK (`gcloud`) authenticated to quiz-manager-f9c45.
 *
 * Usage: npm run deploy:server
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT = process.env.GCLOUD_PROJECT || 'quiz-manager-f9c45'
const REGION = process.env.CLOUD_RUN_REGION || 'europe-west1'
const SERVICE = process.env.CLOUD_RUN_SERVICE || 'rcic-server'
const BUCKET = process.env.GCS_BUCKET || `${PROJECT}-rcic-rooms`

/** Resolve gcloud.cmd on Windows when PATH is stale after install. */
function resolveGcloud() {
  if (process.env.GCLOUD_PATH && fs.existsSync(process.env.GCLOUD_PATH)) {
    return process.env.GCLOUD_PATH
  }

  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['gcloud'], {
    encoding: 'utf8',
    shell: true,
  })
  const fromPath = (which.stdout || '').trim().split(/\r?\n/).find(Boolean)
  if (fromPath && fs.existsSync(fromPath)) return fromPath

  const home = process.env.LOCALAPPDATA || process.env.HOME || ''
  const candidates = [
    path.join(home, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'),
    path.join(home, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'),
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

function printInstallHelp() {
  console.error(`
gcloud CLI was not found on PATH.

Install Google Cloud SDK, then open a NEW terminal and retry:

  winget install -e --id Google.CloudSDK

Or: https://cloud.google.com/sdk/docs/install

Then:

  gcloud auth login
  gcloud config set project ${PROJECT}
  npm run deploy:server
`)
}

const gcloud = resolveGcloud()
if (!gcloud) {
  printInstallHelp()
  process.exit(1)
}

const args = [
  'run',
  'deploy',
  SERVICE,
  '--project',
  PROJECT,
  '--region',
  REGION,
  '--source',
  root,
  '--allow-unauthenticated',
  '--max-instances',
  '1',
  '--session-affinity',
  '--set-env-vars',
  `GCS_BUCKET=${BUCKET},DATA_DIR=/tmp/rooms`,
]

console.log(`Using gcloud: ${gcloud}`)
console.log(`Deploying ${SERVICE} to Cloud Run (${REGION})…`)
console.log(`  project=${PROJECT}`)
console.log(`  GCS_BUCKET=${BUCKET}`)
console.log(
  `  (create the bucket once if needed: gcloud storage buckets create gs://${BUCKET} --project=${PROJECT} --location=${REGION})`,
)
console.log('')

// Quote the binary on Windows — path often contains "Cloud SDK" (spaces).
const bin = process.platform === 'win32' && gcloud.includes(' ') ? `"${gcloud}"` : gcloud
const result = spawnSync(bin, args, { cwd: root, stdio: 'inherit', shell: true, env: process.env })
if (result.error) {
  console.error(result.error.message)
  printInstallHelp()
  process.exit(1)
}
process.exit(result.status ?? 1)
