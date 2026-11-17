/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, GitBranch, Info, Loader2, Search, ShieldCheck, XCircle } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CrossSeedSearchState } from "@/hooks/useCrossSeedWarning"
import {
  getCrossSeedTargetKey,
  getLocalMatchTypeInfo,
  hasBreakableLocalMatches,
  isUnregisteredOrErroredTorrent,
  type CrossSeedDeleteGroup,
  type CrossSeedTorrent
} from "@/lib/cross-seed-utils"
import { getLinuxIsoName, useIncognitoMode } from "@/lib/incognito"
import { getStatusBadgeProps } from "@/lib/torrent-table/row-display"
import { cn } from "@/lib/utils"
import type { UncheckedInstance } from "@/types"
import { useTranslation } from "react-i18next"

interface CrossSeedWarningProps {
  affectedTorrents: CrossSeedTorrent[]
  uncheckedInstances: UncheckedInstance[]
  searchState: CrossSeedSearchState
  hasWarning: boolean
  deleteFiles: boolean
  deleteCrossSeeds: boolean
  onDeleteCrossSeedsChange: (checked: boolean) => void
  onSearch: () => void
  disabled?: boolean
  className?: string
  groups?: CrossSeedDeleteGroup[]
  selectedKeys?: Set<string>
  onToggleCrossSeed?: (key: string, checked?: boolean) => void
  onToggleGroupCrossSeeds?: (sourceKey: string, checked: boolean) => void
  onSelectUnregisteredInGroup?: (sourceKey: string) => void
  onSelectAllCrossSeeds?: () => void
  onDeselectAllCrossSeeds?: () => void
  onSelectAllUnregisteredCrossSeeds?: () => void
}

/** Extract tracker domain from URL, e.g. "https://tracker.example.com:443/announce" -> "tracker.example.com" */
function getTrackerDomain(trackerUrl: string | undefined): string | null {
  if (!trackerUrl) return null
  try {
    const url = new URL(trackerUrl)
    return url.hostname
  } catch {
    // If not a valid URL, try to extract domain-like pattern
    const match = trackerUrl.match(/(?:https?:\/\/)?([^:/]+)/)
    return match?.[1] || null
  }
}

export function CrossSeedWarning({
  affectedTorrents,
  uncheckedInstances,
  searchState,
  hasWarning,
  deleteFiles,
  deleteCrossSeeds,
  onDeleteCrossSeedsChange,
  onSearch,
  disabled,
  className,
  groups,
  selectedKeys,
  onToggleCrossSeed,
  onToggleGroupCrossSeeds,
  onSelectUnregisteredInGroup,
  onSelectAllCrossSeeds,
  onDeselectAllCrossSeeds,
  onSelectAllUnregisteredCrossSeeds,
}: CrossSeedWarningProps) {
  const { t } = useTranslation("torrents")
  const [isExpanded, setIsExpanded] = useState(false)
  const [incognitoMode] = useIncognitoMode()

  // Idle state - show search prompt with contextual urgency
  if (searchState === "idle") {
    // More prominent when deleting files (higher risk of breaking cross-seeds)
    const isHighRisk = deleteFiles

    return (
      <div
        className={cn(
          "group relative rounded-lg border py-2 px-3 transition-all duration-300",
          isHighRisk ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10" : "border-border/50 bg-muted/30 hover:border-border hover:bg-muted/50",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isHighRisk ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <p className={cn(
              "text-xs font-medium truncate",
              isHighRisk ? "text-amber-700 dark:text-amber-300" : "text-foreground"
            )}>
              {isHighRisk ? t("crossSeedWarning.idle.checkForCrossSeeds") : t("crossSeedWarning.idle.crossSeedsNotChecked")}
            </p>
          </div>

          <Button
            type="button"
            variant={isHighRisk ? "default" : "outline"}
            size="sm"
            onClick={onSearch}
            className={cn(
              "shrink-0 h-7 px-2 text-xs transition-all",
              isHighRisk ? "bg-amber-600 hover:bg-amber-700 text-white shadow-sm" : "hover:bg-accent"
            )}
          >
            <Search className="h-3 w-3 mr-1" />
            {t("crossSeedWarning.idle.check")}
          </Button>
        </div>
      </div>
    )
  }

  // Searching state
  if (searchState === "searching") {
    return (
      <div className={cn("flex items-center gap-2 py-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t("crossSeedWarning.searching")}</span>
      </div>
    )
  }

  // Error state
  if (searchState === "error") {
    return (
      <div className={cn("flex items-center gap-2 py-2 text-xs text-muted-foreground", className)}>
        <XCircle className="h-3.5 w-3.5 text-destructive" />
        <span>{t("crossSeedWarning.error")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSearch}
          className="h-6 px-2 text-xs"
        >
          {t("crossSeedWarning.retry")}
        </Button>
      </div>
    )
  }

  // The list can miss torrents on an instance that the check did not read.
  const uncheckedNotes = uncheckedInstances.map(instance => (
    <p key={instance.instanceId} className="mt-1 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        {instance.reason === "offline" ? t("crossSeedWarning.uncheckedOffline", { instance: instance.instanceName }) : t("crossSeedWarning.uncheckedDisabled", { instance: instance.instanceName })}
      </span>
    </p>
  ))

  // Complete state - no cross-seeds found
  if (searchState === "complete" && !hasWarning) {
    return (
      <div className={cn("py-2", className)}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span>{t("crossSeedWarning.noCrossSeeds")}</span>
        </div>
        {uncheckedNotes}
      </div>
    )
  }

  // Complete state - cross-seeds found, show warning
  const effectiveSelectedKeys = selectedKeys ?? new Set(affectedTorrents.map(getCrossSeedTargetKey))
  const selectedTorrentsList = deleteCrossSeeds
    ? affectedTorrents.filter(t => effectiveSelectedKeys.has(getCrossSeedTargetKey(t)))
    : []
  const unselectedTorrentsList = deleteCrossSeeds
    ? affectedTorrents.filter(t => !effectiveSelectedKeys.has(getCrossSeedTargetKey(t)))
    : affectedTorrents
  const selectedCount = selectedTorrentsList.length
  const unregisteredCount = affectedTorrents.filter(isUnregisteredOrErroredTorrent).length

  // Group by instance for fallback rendering when groups prop is not passed
  const byInstance = affectedTorrents.reduce<Record<string, CrossSeedTorrent[]>>(
    (acc, torrent) => {
      const key = torrent.instanceName || `Instance ${torrent.instanceId}`
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(torrent)
      return acc
    },
    {}
  )

  const instanceCount = Object.keys(byInstance).length
  const linkedCopyCount = unselectedTorrentsList.filter(
    torrent => getLocalMatchTypeInfo(torrent.matchType).independentlyUsable
  ).length
  // Hardlink and ReFS reflink copies remain usable after source deletion.
  // Only torrents sharing the source content path break.
  const hasSharedPathMatches = hasBreakableLocalMatches(unselectedTorrentsList)
  const linkedCopiesOnly = unselectedTorrentsList.length > 0 && linkedCopyCount === unselectedTorrentsList.length
  const hardlinkCopiesOnly = linkedCopiesOnly && unselectedTorrentsList.every(
    torrent => torrent.matchType === "hardlink"
  )
  const hasReflinkCopies = unselectedTorrentsList.some(torrent => torrent.matchType === "reflink")
  const hasKeptCrossSeeds = unselectedTorrentsList.length > 0
  // Show destructive styling if deleting files breaks cross-seeds (without protection) OR if user opted to delete cross-seeds
  const isDestructive = (deleteCrossSeeds && selectedCount > 0) || (deleteFiles && !hasKeptCrossSeeds && hasBreakableLocalMatches(affectedTorrents))

  // Collect unique trackers for summary
  const uniqueTrackers = new Set<string>()
  affectedTorrents.forEach((t) => {
    const domain = getTrackerDomain(t.tracker)
    if (domain) uniqueTrackers.add(domain)
  })

  const showAffectedList = isExpanded || deleteCrossSeeds
  const groupsWithMatches = (groups ?? []).filter(g => g.matches.length > 0)
  const groupsWithoutMatchesCount = (groups ?? []).filter(g => g.matches.length === 0).length
  const canSelectIndividually = Boolean(onToggleCrossSeed)

  const handleMasterToggle = (checked: boolean) => {
    if (checked && effectiveSelectedKeys.size === 0) {
      onSelectAllCrossSeeds?.()
    }
    onDeleteCrossSeedsChange(checked)
  }

  const handleRowToggle = (key: string, nextChecked: boolean) => {
    if (!onToggleCrossSeed) return
    if (!deleteCrossSeeds && nextChecked) {
      onDeselectAllCrossSeeds?.()
      onToggleCrossSeed(key, true)
      onDeleteCrossSeedsChange(true)
      return
    }
    onToggleCrossSeed(key, nextChecked)
  }

  const handleGroupToggle = (sourceKey: string, nextChecked: boolean) => {
    if (!onToggleGroupCrossSeeds) return
    if (!deleteCrossSeeds && nextChecked) {
      onDeselectAllCrossSeeds?.()
      onToggleGroupCrossSeeds(sourceKey, true)
      onDeleteCrossSeedsChange(true)
      return
    }
    onToggleGroupCrossSeeds(sourceKey, nextChecked)
  }

  const handleSelectUnregisteredInGroup = (sourceKey: string) => {
    if (!onSelectUnregisteredInGroup) return
    if (!deleteCrossSeeds) {
      onDeselectAllCrossSeeds?.()
      onDeleteCrossSeedsChange(true)
    }
    onSelectUnregisteredInGroup(sourceKey)
  }

  return (
    <div
      className={cn(
        "rounded-lg border py-3 px-4 overflow-hidden",
        isDestructive ? "border-destructive/40 bg-destructive/5" : "border-blue-500/30 bg-blue-500/5",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {isDestructive ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
        )}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium",
            isDestructive ? "text-destructive" : "text-blue-600 dark:text-blue-400"
          )}>
            {deleteCrossSeeds && selectedCount > 0
              ? t("crossSeedWarning.deleteCrossSeeds")
              : deleteFiles
                ? (linkedCopiesOnly ? t(hardlinkCopiesOnly ? "crossSeedWarning.hardlinkedCopies" : "crossSeedWarning.linkedCopies") : t("crossSeedWarning.deletingFilesBreaks"))
                : t("crossSeedWarning.dataPreserved")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {affectedTorrents.length === 1 ? t("crossSeedWarning.torrentShares", { count: affectedTorrents.length }) : t("crossSeedWarning.torrentsShare", { count: affectedTorrents.length })}
            {instanceCount > 1 && ` ${t("crossSeedWarning.acrossInstances", { count: instanceCount })}`}
            {uniqueTrackers.size > 0 && (
              <span className="ml-1">
                {uniqueTrackers.size === 1 ? t("crossSeedWarning.onTracker", { tracker: Array.from(uniqueTrackers)[0] }) : t("crossSeedWarning.onTrackers", { count: uniqueTrackers.size })}
              </span>
            )}
            {deleteCrossSeeds && selectedCount > 0
              ? ` ${t("crossSeedWarning.willBeRemoved")}`
              : deleteFiles
                ? (linkedCopiesOnly ? ` ${t(hardlinkCopiesOnly ? "crossSeedWarning.spaceNotFreed" : "crossSeedWarning.sharedBlocksMayRemain")}` : ` ${t("crossSeedWarning.willNeedRedownload")}`)
                : ` ${t("crossSeedWarning.unaffected")}`}
          </p>
          {deleteCrossSeeds && canSelectIndividually && (
            <p className="mt-0.5 text-xs font-medium text-foreground/80">
              {t("crossSeedWarning.selectedSummary", { selected: selectedCount, total: affectedTorrents.length })}
            </p>
          )}
          {deleteFiles && !deleteCrossSeeds && linkedCopyCount > 0 && hasSharedPathMatches && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(hasReflinkCopies ? "crossSeedWarning.mixedLinkedNote" : "crossSeedWarning.mixedHardlinkNote")}
            </p>
          )}
          {uncheckedNotes}
        </div>
      </div>

      {/* Delete cross-seeds option + quick selection toolbar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="deleteCrossSeeds"
            checked={deleteCrossSeeds}
            onCheckedChange={(checked) => handleMasterToggle(checked === true)}
            disabled={disabled}
          />
          <label
            htmlFor="deleteCrossSeeds"
            className="text-xs cursor-pointer select-none"
          >
            {t("crossSeedWarning.alsoDeleteCrossSeeds")}
          </label>
        </div>

        {deleteCrossSeeds && canSelectIndividually && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={disabled || selectedCount === affectedTorrents.length}
              onClick={onSelectAllCrossSeeds}
            >
              {t("crossSeedWarning.selectAll", { count: affectedTorrents.length })}
            </Button>
            {unregisteredCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px] border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                disabled={disabled}
                onClick={onSelectAllUnregisteredCrossSeeds}
              >
                {t("crossSeedWarning.selectUnregistered", { count: unregisteredCount })}
              </Button>
            )}
            {selectedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={disabled}
                onClick={onDeselectAllCrossSeeds}
              >
                {t("crossSeedWarning.clearSelection")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expandable torrent list */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAffectedList ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <GitBranch className="h-3 w-3" />
          <span>{showAffectedList ? t("crossSeedWarning.hideAffected") : t("crossSeedWarning.showAffected")}</span>
        </button>

        {showAffectedList && (
          <div className="mt-2 max-h-[38vh] overflow-y-auto pr-1 space-y-2.5">
            {groupsWithMatches.length > 0 ? (
              <>
                {groupsWithMatches.map((group) => {
                  const sourceKey = getCrossSeedTargetKey(group.source)
                  const groupSelectedCount = deleteCrossSeeds
                    ? group.matches.filter(m => effectiveSelectedKeys.has(getCrossSeedTargetKey(m))).length
                    : 0
                  const allGroupSelected = groupSelectedCount === group.matches.length
                  const someGroupSelected = groupSelectedCount > 0 && !allGroupSelected
                  const groupUnregisteredCount = group.matches.filter(isUnregisteredOrErroredTorrent).length
                  const sourceDomain = getTrackerDomain(group.source.tracker)
                  const sourceStatus = getStatusBadgeProps(group.source, true, t)
                  const showSourceStatus = Boolean(group.source.tracker_health || group.source.state)
                  const keptCount = group.matches.length - groupSelectedCount

                  return (
                    <div
                      key={sourceKey}
                      className="rounded-md border border-border/70 bg-background/60 p-2.5 space-y-2"
                    >
                      {/* Group header: selected torrent */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {canSelectIndividually && (
                            <Checkbox
                              checked={allGroupSelected ? true : someGroupSelected ? "indeterminate" : false}
                              onCheckedChange={(checked) => handleGroupToggle(sourceKey, checked === true)}
                              disabled={disabled}
                              aria-label={incognitoMode ? getLinuxIsoName(group.source.hash) : group.source.name}
                            />
                          )}
                          <span className="text-xs font-semibold truncate min-w-0">
                            {incognitoMode ? getLinuxIsoName(group.source.hash) : group.source.name}
                          </span>
                          {sourceDomain && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {sourceDomain}
                            </span>
                          )}
                          {showSourceStatus && (
                            <Badge variant={sourceStatus.variant} className={cn("text-[10px] px-1.5 py-0 shrink-0", sourceStatus.className)}>
                              {sourceStatus.label}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {deleteFiles && (
                            allGroupSelected ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                {t("crossSeedWarning.groupFilesDeleted")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 dark:text-blue-400 border-blue-500/40 bg-blue-500/10 gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                {t("crossSeedWarning.groupFilesKept", { count: keptCount })}
                              </Badge>
                            )
                          )}
                          {groupUnregisteredCount > 0 && canSelectIndividually && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-red-600 dark:text-red-400 hover:bg-red-500/10"
                              disabled={disabled}
                              onClick={() => handleSelectUnregisteredInGroup(sourceKey)}
                            >
                              {t("crossSeedWarning.selectUnregisteredShort", { count: groupUnregisteredCount })}
                            </Button>
                          )}
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {t("crossSeedWarning.groupSelectedCount", { selected: groupSelectedCount, total: group.matches.length })}
                          </span>
                        </div>
                      </div>

                      {/* Cross-seed rows for this selected torrent */}
                      <div className="space-y-1 pl-1">
                        {group.matches.map((torrent) => {
                          const key = getCrossSeedTargetKey(torrent)
                          const isChecked = deleteCrossSeeds && effectiveSelectedKeys.has(key)
                          const trackerDomain = getTrackerDomain(torrent.tracker)
                          const statusProps = getStatusBadgeProps(torrent, true, t)
                          const showStatus = Boolean(torrent.tracker_health || torrent.state)
                          const instanceLabel = torrent.instanceName || `Instance ${torrent.instanceId}`

                          return (
                            <label
                              key={`${sourceKey}-${key}`}
                              className={cn(
                                "flex items-center gap-2 rounded px-1.5 py-1 text-xs min-w-0 cursor-pointer transition-colors hover:bg-muted/50",
                                isChecked && "bg-destructive/5"
                              )}
                            >
                              {canSelectIndividually && (
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => handleRowToggle(key, checked === true)}
                                  disabled={disabled}
                                />
                              )}
                              <span className="truncate min-w-0 flex-1">
                                {incognitoMode ? getLinuxIsoName(torrent.hash) : torrent.name}
                              </span>
                              {showStatus && (
                                <Badge variant={statusProps.variant} className={cn("text-[10px] px-1.5 py-0 shrink-0", statusProps.className)}>
                                  {statusProps.label}
                                </Badge>
                              )}
                              {trackerDomain && (
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {trackerDomain}
                                </span>
                              )}
                              <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {instanceLabel}
                              </span>
                              {getLocalMatchTypeInfo(torrent.matchType).independentlyUsable && (
                                <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                                  {torrent.matchType === "reflink" ? t("crossSeedTable.matchTypes.reflink.label") : t("crossSeedTable.matchTypes.hardlink.label")}
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {groupsWithoutMatchesCount > 0 && (
                  <p className="text-[11px] text-muted-foreground px-1">
                    {deleteFiles
                      ? t("crossSeedWarning.noCrossSeedsGroup", { count: groupsWithoutMatchesCount })
                      : t("crossSeedWarning.noCrossSeedsGroupSafe", { count: groupsWithoutMatchesCount })}
                  </p>
                )}
              </>
            ) : (
              Object.entries(byInstance).map(([instanceName, torrents]) => (
                <div key={instanceName} className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {instanceName}
                  </p>
                  <div className="space-y-1 min-w-0">
                    {torrents.slice(0, 8).map((torrent) => {
                      const key = getCrossSeedTargetKey(torrent)
                      const isChecked = deleteCrossSeeds && effectiveSelectedKeys.has(key)
                      const trackerDomain = getTrackerDomain(torrent.tracker)
                      return (
                        <div
                          key={`${torrent.hash}-${torrent.instanceId}`}
                          className="flex items-center gap-2 py-0.5 text-xs min-w-0"
                        >
                          {canSelectIndividually && (
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => handleRowToggle(key, checked === true)}
                              disabled={disabled}
                            />
                          )}
                          <span className="truncate min-w-0 flex-1">
                            {incognitoMode ? getLinuxIsoName(torrent.hash) : torrent.name}
                          </span>
                          {trackerDomain && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {trackerDomain}
                            </span>
                          )}
                          {getLocalMatchTypeInfo(torrent.matchType).independentlyUsable && (
                            <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                              {torrent.matchType === "reflink" ? t("crossSeedTable.matchTypes.reflink.label") : t("crossSeedTable.matchTypes.hardlink.label")}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {torrents.length > 8 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-[10px] text-muted-foreground pt-0.5 cursor-help hover:text-foreground transition-colors w-fit">
                            {t("crossSeedWarning.more", { count: torrents.length - 8 })}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start" className="max-w-sm">
                          <div className="space-y-0.5">
                            {torrents.slice(8).map((t) => (
                              <p key={`${t.hash}-${t.instanceId}`} className="truncate text-xs">
                                {incognitoMode ? getLinuxIsoName(t.hash) : t.name}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
