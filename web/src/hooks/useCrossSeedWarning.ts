/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { api } from "@/lib/api"
import {
  buildFallbackCrossSeedGroups,
  getCrossSeedTargetKey,
  isUnregisteredOrErroredTorrent,
  toCompatibleMatch,
  type CrossSeedDeleteGroup,
  type CrossSeedTorrent
} from "@/lib/cross-seed-utils"
import { buildTorrentActionTargets, type TorrentActionTarget } from "@/lib/torrent-action-targets"
import type { Torrent, TorrentFilters, UncheckedInstance } from "@/types"

/** The select-all scope of a delete, as the bulk action sends it. */
export interface CrossSeedSelectAllScope {
  filters?: TorrentFilters
  search?: string
  excludeHashes?: string[]
  excludeTargets?: TorrentActionTarget[]
  instanceIds?: number[]
}

interface UseCrossSeedWarningOptions {
  instanceId: number
  torrents: Torrent[]
  /** Set in Select all mode: the check then covers every selected torrent, not only `torrents`. */
  selectAll?: CrossSeedSelectAllScope
}

export type CrossSeedSearchState = "idle" | "searching" | "complete" | "error"

export interface CrossSeedWarningResult {
  /** Cross-seed torrents that share files with torrents being deleted */
  affectedTorrents: CrossSeedTorrent[]
  /** Per-selected-torrent cross-seed groups */
  groups: CrossSeedDeleteGroup[]
  /** Set of `${instanceId}:${hash}` keys of cross-seeds selected for deletion */
  selectedKeys: Set<string>
  /** Subset of affectedTorrents whose key is in selectedKeys */
  selectedCrossSeeds: CrossSeedTorrent[]
  /** Instances that the check could not read, so the list can miss torrents on them */
  uncheckedInstances: UncheckedInstance[]
  /** Current search state */
  searchState: CrossSeedSearchState
  /** Whether there are cross-seeds that would be affected */
  hasWarning: boolean
  /** Trigger the cross-seed search */
  search: () => void
  /** Reset the search state and stop a running search */
  reset: () => void
  /** Toggle a single cross-seed key on or off */
  toggleCrossSeed: (key: string, checked?: boolean) => void
  /** Toggle all cross-seeds belonging to a specific source torrent group */
  toggleGroupCrossSeeds: (sourceKey: string, checked: boolean) => void
  /** Select only unregistered/error cross-seeds in a specific source torrent group */
  selectUnregisteredInGroup: (sourceKey: string) => void
  /** Select all cross-seeds across all groups */
  selectAllCrossSeeds: () => void
  /** Deselect all cross-seeds across all groups */
  deselectAllCrossSeeds: () => void
  /** Select only unregistered/error cross-seeds across all groups */
  selectAllUnregisteredCrossSeeds: () => void
}

/**
 * Hook to detect cross-seeded torrents that would be affected when deleting files.
 *
 * Search is opt-in - call `search()` to check for cross-seeds. One request
 * checks every selected torrent; the backend leaves the selected torrents out
 * of the result. `reset()` and unmount stop a running search.
 */
export function useCrossSeedWarning({
  instanceId,
  torrents,
  selectAll,
}: UseCrossSeedWarningOptions): CrossSeedWarningResult {
  const [searchState, setSearchState] = useState<CrossSeedSearchState>("idle")
  const [affectedTorrents, setAffectedTorrents] = useState<CrossSeedTorrent[]>([])
  const [groups, setGroups] = useState<CrossSeedDeleteGroup[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [uncheckedInstances, setUncheckedInstances] = useState<UncheckedInstance[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const search = useCallback(async () => {
    abortRef.current?.abort()
    if (!selectAll && torrents.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller

    setSearchState("searching")
    setAffectedTorrents([])
    setGroups([])
    setSelectedKeys(new Set())
    setUncheckedInstances([])

    try {
      const selection = selectAll ? { selectAll: true, ...selectAll } : { targets: buildTorrentActionTargets(torrents, instanceId) }
      const result = await api.getDeleteCrossSeeds(instanceId, selection, controller.signal)
      // The body can finish reading after the abort.
      if (controller.signal.aborted) return
      const matches = result.matches.map(toCompatibleMatch)
      const resolvedGroups = result.groups
        ? result.groups.map(g => ({
          source: toCompatibleMatch(g.source),
          matches: g.matches.map(toCompatibleMatch),
        }))
        : buildFallbackCrossSeedGroups(torrents, instanceId, matches)
      setAffectedTorrents(matches)
      setGroups(resolvedGroups)
      setSelectedKeys(new Set(matches.map(getCrossSeedTargetKey)))
      setUncheckedInstances(result.uncheckedInstances)
      setSearchState("complete")
    } catch (error) {
      if (controller.signal.aborted) return
      console.error("[CrossSeedWarning] Search failed:", error)
      setSearchState("error")
    }
  }, [instanceId, torrents, selectAll])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setSearchState("idle")
    setAffectedTorrents([])
    setGroups([])
    setSelectedKeys(new Set())
    setUncheckedInstances([])
  }, [])

  const toggleCrossSeed = useCallback((key: string, checked?: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      const shouldSelect = checked === undefined ? !next.has(key) : checked
      if (shouldSelect) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [])

  const toggleGroupCrossSeeds = useCallback((sourceKey: string, checked: boolean) => {
    const group = groups.find(g => getCrossSeedTargetKey(g.source) === sourceKey)
    if (!group) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const m of group.matches) {
        const key = getCrossSeedTargetKey(m)
        if (checked) {
          next.add(key)
        } else {
          next.delete(key)
        }
      }
      return next
    })
  }, [groups])

  const selectUnregisteredInGroup = useCallback((sourceKey: string) => {
    const group = groups.find(g => getCrossSeedTargetKey(g.source) === sourceKey)
    if (!group) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const m of group.matches) {
        const key = getCrossSeedTargetKey(m)
        if (isUnregisteredOrErroredTorrent(m)) {
          next.add(key)
        } else {
          next.delete(key)
        }
      }
      return next
    })
  }, [groups])

  const selectAllCrossSeeds = useCallback(() => {
    setSelectedKeys(new Set(affectedTorrents.map(getCrossSeedTargetKey)))
  }, [affectedTorrents])

  const deselectAllCrossSeeds = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  const selectAllUnregisteredCrossSeeds = useCallback(() => {
    setSelectedKeys(new Set(
      affectedTorrents
        .filter(isUnregisteredOrErroredTorrent)
        .map(getCrossSeedTargetKey)
    ))
  }, [affectedTorrents])

  const selectedCrossSeeds = useMemo(
    () => affectedTorrents.filter(t => selectedKeys.has(getCrossSeedTargetKey(t))),
    [affectedTorrents, selectedKeys]
  )

  return {
    affectedTorrents,
    groups,
    selectedKeys,
    selectedCrossSeeds,
    uncheckedInstances,
    searchState,
    hasWarning: affectedTorrents.length > 0,
    search,
    reset,
    toggleCrossSeed,
    toggleGroupCrossSeeds,
    selectUnregisteredInGroup,
    selectAllCrossSeeds,
    deselectAllCrossSeeds,
    selectAllUnregisteredCrossSeeds,
  }
}
