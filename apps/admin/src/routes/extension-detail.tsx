import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useDeleteExtension,
  useDeleteRating,
  useExtension,
  useHideRating,
  usePatchExtension,
  useUnyankVersion,
  useYankVersion,
} from '../api/hooks'
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Spinner,
  Textarea,
} from '../components/ui'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fmtBytes, fmtDate, fmtNumber, fmtRelative } from '../lib/cn'

const CATEGORIES = [
  'productivity',
  'language',
  'theme',
  'remote',
  'ai',
  'git',
  'other',
]

export function ExtensionDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useExtension(id)
  const patch = usePatchExtension(id)
  const del = useDeleteExtension(id)
  const yank = useYankVersion(id)
  const unyank = useUnyankVersion(id)
  const hideRating = useHideRating(id)
  const deleteRating = useDeleteRating(id)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRecommend, setConfirmRecommend] = useState(false)
  const [yankTarget, setYankTarget] = useState<{ version: string; reason: string } | null>(
    null,
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    displayName: '',
    description: '',
    category: '',
    iconUrl: '',
  })

  if (q.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Spinner /> loading…
      </div>
    )
  if (q.error || !q.data)
    return <p className="text-sm text-red-300">extension not found.</p>

  const ext = q.data

  function startEdit() {
    setDraft({
      displayName: ext.displayName,
      description: ext.description,
      category: ext.category,
      iconUrl: ext.iconUrl ?? '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    await patch.mutateAsync({
      displayName: draft.displayName,
      description: draft.description,
      category: draft.category,
      iconUrl: draft.iconUrl || null,
    })
    setEditing(false)
  }

  async function toggleCurated() {
    await patch.mutateAsync({ curated: !ext.curated })
  }

  async function toggleRecommended() {
    if (!ext.recommended) {
      setConfirmRecommend(true)
    } else {
      await patch.mutateAsync({ recommended: false })
    }
  }

  async function confirmRecommendYes() {
    setConfirmRecommend(false)
    await patch.mutateAsync({ recommended: true })
  }

  async function performDelete() {
    setConfirmDelete(false)
    await del.mutateAsync()
    navigate('/extensions', { replace: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/extensions"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← all extensions
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-100">
            {ext.displayName}{' '}
            <span className="text-sm text-zinc-500">{ext.id}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            by {ext.authorLogin ?? ext.authorId} · latest{' '}
            <span className="font-mono">{ext.latestVersion}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={toggleCurated} variant={ext.curated ? 'primary' : 'secondary'}>
            {ext.curated ? 'curated' : 'mark curated'}
          </Button>
          <Button
            onClick={toggleRecommended}
            variant={ext.recommended ? 'primary' : 'secondary'}
          >
            {ext.recommended ? 'recommended' : 'mark recommended'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-zinc-500">downloads</p>
          <p className="mt-1 text-2xl font-semibold">{fmtNumber(ext.downloadTotal)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-zinc-500">rating</p>
          <p className="mt-1 text-2xl font-semibold">
            {ext.avgStars != null ? ext.avgStars.toFixed(2) : '—'}{' '}
            <span className="text-sm text-zinc-500">({ext.ratingCount})</span>
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-zinc-500">category</p>
          <p className="mt-1 text-2xl font-semibold">{ext.category}</p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">details</h2>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={startEdit}>
              edit
            </Button>
          )}
        </div>
        {editing ? (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              display name
              <Input
                value={draft.displayName}
                onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              description
              <Textarea
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              category
              <Select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              icon url
              <Input
                value={draft.iconUrl}
                onChange={(e) => setDraft({ ...draft, iconUrl: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <Button variant="primary" onClick={saveEdit} disabled={patch.isPending}>
                save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                cancel
              </Button>
            </div>
          </div>
        ) : (
          <dl className="mt-3 space-y-2 text-sm">
            <Field label="description">
              {ext.description || (
                <span className="text-zinc-500">no description</span>
              )}
            </Field>
            <Field label="icon">
              {ext.iconUrl ? (
                <a className="text-indigo-400 hover:underline" href={ext.iconUrl}>
                  {ext.iconUrl}
                </a>
              ) : (
                <span className="text-zinc-500">none</span>
              )}
            </Field>
            <Field label="homepage">
              {ext.homepageUrl ? (
                <a className="text-indigo-400 hover:underline" href={ext.homepageUrl}>
                  {ext.homepageUrl}
                </a>
              ) : (
                <span className="text-zinc-500">none</span>
              )}
            </Field>
            <Field label="repo">
              {ext.repoUrl ? (
                <a className="text-indigo-400 hover:underline" href={ext.repoUrl}>
                  {ext.repoUrl}
                </a>
              ) : (
                <span className="text-zinc-500">none</span>
              )}
            </Field>
            <Field label="created">{fmtDate(ext.createdAt)}</Field>
            <Field label="updated">{fmtDate(ext.updatedAt)}</Field>
          </dl>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-zinc-200">versions</h2>
        {ext.versions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">no versions.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {ext.versions.map((v) => (
              <li
                key={v.version}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-zinc-200">{v.version}</span>
                  {v.yanked && <Badge tone="danger">yanked</Badge>}
                  <span className="font-mono text-xs text-zinc-500">
                    {v.sha256.slice(0, 16)}…
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">
                    {fmtBytes(v.sizeBytes)} · {fmtRelative(v.publishedAt)}
                  </span>
                  {v.yanked ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => unyank.mutate(v.version)}
                    >
                      unyank
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setYankTarget({ version: v.version, reason: '' })
                      }
                    >
                      yank
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-zinc-200">ratings</h2>
        {ext.ratings.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">no ratings.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {ext.ratings.map((r) => (
              <li key={r.userId} className="flex items-start justify-between gap-3 py-2">
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-zinc-200">{r.userLogin}</span>{' '}
                    <span className="text-zinc-500">
                      {'★'.repeat(r.stars)}
                      {'☆'.repeat(5 - r.stars)}
                    </span>{' '}
                    {r.hidden && <Badge tone="warning">hidden</Badge>}
                  </p>
                  {r.comment && (
                    <p className="mt-1 text-sm text-zinc-300">{r.comment}</p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">{fmtRelative(r.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  {!r.hidden && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => hideRating.mutate(r.userId)}
                    >
                      hide
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteRating.mutate(r.userId)}
                  >
                    delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="delete extension?"
        description={`this will permanently remove ${ext.id}, all ${ext.versions.length} versions, package blobs and ratings. cannot be undone.`}
        confirmLabel="delete forever"
        variant="danger"
        busy={del.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
      />
      <ConfirmDialog
        open={confirmRecommend}
        title="mark as recommended?"
        description="recommended extensions appear in the client onboarding flow and are pushed to all users on first launch. only enable for extensions you have personally vetted."
        confirmLabel="mark recommended"
        busy={patch.isPending}
        onCancel={() => setConfirmRecommend(false)}
        onConfirm={confirmRecommendYes}
      />
      <ConfirmDialog
        open={!!yankTarget}
        title={`yank ${yankTarget?.version ?? ''}?`}
        description="yanked versions remain downloadable for installed clients but won't be offered as updates. provide a reason for the audit log."
        confirmLabel="yank"
        variant="danger"
        busy={yank.isPending}
        onCancel={() => setYankTarget(null)}
        onConfirm={async () => {
          if (!yankTarget) return
          await yank.mutateAsync(yankTarget)
          setYankTarget(null)
        }}
      />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-zinc-200">{children}</dd>
    </div>
  )
}
