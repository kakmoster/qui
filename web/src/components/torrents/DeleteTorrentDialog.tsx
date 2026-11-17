/*
 * Copyright (c) 2025-2026, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { CrossSeedWarning } from "./CrossSeedWarning"
import { DeleteFilesPreference } from "./DeleteFilesPreference"
import type { CrossSeedWarningResult } from "@/hooks/useCrossSeedWarning"
import { Checkbox } from "@/components/ui/checkbox"
import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import type { Torrent } from "@/types"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCrossSeedTargetKey } from "@/lib/cross-seed-utils"
import { getLinuxIsoName, useIncognitoMode } from "@/lib/incognito"

// From this many torrents, the dialog names a few of them and the button shows the count.
const LARGE_DELETE = 10

interface DeleteTorrentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  totalSize: number
  formattedSize: string
  deleteFiles: boolean
  onDeleteFilesChange: (checked: boolean) => void
  isDeleteFilesLocked: boolean
  onToggleDeleteFilesLock: () => void
  deleteCrossSeeds: boolean
  onDeleteCrossSeedsChange: (checked: boolean) => void
  showBlockCrossSeeds: boolean
  blockCrossSeeds: boolean
  onBlockCrossSeedsChange: (checked: boolean) => void
  crossSeedWarning?: CrossSeedWarningResult | null
  // The confirm button closes the dialog, unless the handler calls preventDefault on the event.
  onConfirm: (event: MouseEvent<HTMLButtonElement>) => void
  isPending?: boolean
  isAllSelected?: boolean
  // Loaded torrents that the delete reaches. In select all mode, the others are not loaded in the table.
  previewTorrents?: Torrent[]
}

export function DeleteTorrentDialog({
  open,
  onOpenChange,
  count,
  totalSize,
  formattedSize,
  deleteFiles,
  onDeleteFilesChange,
  isDeleteFilesLocked,
  onToggleDeleteFilesLock,
  deleteCrossSeeds,
  onDeleteCrossSeedsChange,
  showBlockCrossSeeds,
  blockCrossSeeds,
  onBlockCrossSeedsChange,
  crossSeedWarning,
  onConfirm,
  isPending,
  isAllSelected = false,
  previewTorrents = [],
}: DeleteTorrentDialogProps) {
  const { t } = useTranslation("torrents")
  const [incognitoMode] = useIncognitoMode()
  // Include cross-seeds in the displayed count when selected
  const crossSeedCount = deleteCrossSeeds
    ? (crossSeedWarning?.selectedKeys ? crossSeedWarning.selectedKeys.size : (crossSeedWarning?.affectedTorrents.length ?? 0))
    : 0
  const displayCount = count + crossSeedCount
  const isLarge = isAllSelected || displayCount >= LARGE_DELETE
  const shown = previewTorrents.slice(0, 3)
  const notLoaded = Math.max(0, count - previewTorrents.length)

  const totalAffected = crossSeedWarning?.affectedTorrents.length ?? 0
  const hasKeptCrossSeeds =
    deleteFiles &&
    crossSeedWarning?.searchState === "complete" &&
    crossSeedWarning.hasWarning &&
    crossSeedCount < totalAffected
  const warningGroups = crossSeedWarning?.groups ?? []
  const selectedKeys = crossSeedWarning?.selectedKeys
  const safeGroupCount = warningGroups.filter(group =>
    group.matches.length === 0 ||
    (deleteCrossSeeds && group.matches.every(m => (selectedKeys ? selectedKeys.has(getCrossSeedTargetKey(m)) : true)))
  ).length
  const isPartialFileDelete = hasKeptCrossSeeds && safeGroupCount > 0

  return (
    // A delete that started cannot stop, so the dialog stays open until it ends.
    <AlertDialog open={open} onOpenChange={(next) => isPending || onOpenChange(next)}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAllSelected ? t("deleteDialog.titleSelectAll", { count }) : t("deleteDialog.title", { count: displayCount })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDialog.description")}
            {totalSize > 0 && (
              <span className="block mt-2 text-xs text-muted-foreground">
                {t("deleteDialog.totalSize", { size: formattedSize })}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isLarge && (
          <div className="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              {isAllSelected && (
                <p className="font-medium text-destructive">
                  {t("deleteDialog.selectAllNotice")}
                  {notLoaded > 0 && ` ${t("deleteDialog.notLoaded", { count: notLoaded })}`}
                </p>
              )}
              <ul className={cn("space-y-0.5 text-xs text-muted-foreground", isAllSelected && "mt-2")}>
                {shown.map(torrent => <li key={torrent.hash} className="truncate">{incognitoMode ? getLinuxIsoName(torrent.hash) : torrent.name}</li>)}
                {displayCount > shown.length && <li>{t("deleteDialog.andMore", { more: displayCount - shown.length })}</li>}
              </ul>
            </div>
          </div>
        )}
        <DeleteFilesPreference
          id="deleteFiles"
          checked={deleteFiles}
          onCheckedChange={onDeleteFilesChange}
          isLocked={isDeleteFilesLocked}
          onToggleLock={onToggleDeleteFilesLock}
          disabled={isPending}
        />
        {hasKeptCrossSeeds && (
          <div className="flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <p>
              {isPartialFileDelete
                ? t("crossSeedWarning.safeFileDeletePartialNotice")
                : t("crossSeedWarning.safeFileDeleteAllKeptNotice")}
            </p>
          </div>
        )}
        {crossSeedWarning && (
          <CrossSeedWarning
            affectedTorrents={crossSeedWarning.affectedTorrents}
            uncheckedInstances={crossSeedWarning.uncheckedInstances}
            searchState={crossSeedWarning.searchState}
            hasWarning={crossSeedWarning.hasWarning}
            deleteFiles={deleteFiles}
            deleteCrossSeeds={deleteCrossSeeds}
            onDeleteCrossSeedsChange={onDeleteCrossSeedsChange}
            onSearch={crossSeedWarning.search}
            disabled={isPending}
            groups={crossSeedWarning.groups}
            selectedKeys={crossSeedWarning.selectedKeys}
            onToggleCrossSeed={crossSeedWarning.toggleCrossSeed}
            onToggleGroupCrossSeeds={crossSeedWarning.toggleGroupCrossSeeds}
            onSelectUnregisteredInGroup={crossSeedWarning.selectUnregisteredInGroup}
            onSelectAllCrossSeeds={crossSeedWarning.selectAllCrossSeeds}
            onDeselectAllCrossSeeds={crossSeedWarning.deselectAllCrossSeeds}
            onSelectAllUnregisteredCrossSeeds={crossSeedWarning.selectAllUnregisteredCrossSeeds}
          />
        )}
        {showBlockCrossSeeds && (
          <div className="mt-3 flex items-center gap-2">
            <Checkbox
              id="blockCrossSeeds"
              checked={blockCrossSeeds}
              onCheckedChange={(checked) => onBlockCrossSeedsChange(checked === true)}
              disabled={isPending}
            />
            <label
              htmlFor="blockCrossSeeds"
              className="text-xs cursor-pointer select-none"
            >
              {t("deleteDialog.blockCrossSeeds")}
            </label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("deleteDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLarge ? t("deleteDialog.deleteCount", { count: displayCount }) : t("deleteDialog.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
