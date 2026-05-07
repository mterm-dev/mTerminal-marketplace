import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, setCsrfToken, type AdminExtensionPatch } from './client'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api.me()
      if (me.csrfToken) setCsrfToken(me.csrfToken)
      return me
    },
    staleTime: 60_000,
  })
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() })
}

export function useExtensions(params: URLSearchParams) {
  return useQuery({
    queryKey: ['extensions', params.toString()],
    queryFn: () => api.listExtensions(params),
    placeholderData: (prev) => prev,
  })
}

export function useExtension(id: string) {
  return useQuery({
    queryKey: ['extension', id],
    queryFn: () => api.getExtension(id),
    enabled: !!id,
  })
}

export function usePatchExtension(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: AdminExtensionPatch) => api.patchExtension(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extension', id] })
      qc.invalidateQueries({ queryKey: ['extensions'] })
    },
  })
}

export function useDeleteExtension(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.deleteExtension(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extensions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useYankVersion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { version: string; reason: string }) =>
      api.yankVersion(id, vars.version, vars.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension', id] }),
  })
}

export function useUnyankVersion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (version: string) => api.unyankVersion(id, version),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension', id] }),
  })
}

export function useAuthors(params: URLSearchParams) {
  return useQuery({
    queryKey: ['authors', params.toString()],
    queryFn: () => api.listAuthors(params),
    placeholderData: (prev) => prev,
  })
}

export function useBanAuthor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; ban: boolean }) =>
      vars.ban ? api.banAuthor(vars.id) : api.unbanAuthor(vars.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['authors'] }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.revokeAuthorApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['authors'] }),
  })
}

export function useRevokeAllKeys() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.revokeAllAuthorKeys(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['authors'] }),
  })
}

export function useAudit(params: URLSearchParams) {
  return useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api.listAudit(params),
    placeholderData: (prev) => prev,
  })
}

export function useHideRating(extId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.hideRating(extId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension', extId] }),
  })
}

export function useDeleteRating(extId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.deleteRating(extId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension', extId] }),
  })
}
