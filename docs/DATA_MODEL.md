# Дані та інваріанти

Джерела: `src/domain/types.ts`, `src/storage/db.ts`, `src/domain/*Validation.ts`, `src/domain/validation.ts`. Структура модулів: [ARCHITECTURE.md](ARCHITECTURE.md).
IndexedDB `planui_local_db`, схема 1. Усі 21 стор використовують `keyPath: id`. Таблиця містить ключові поля; повний перелік і необов'язковість визначають TypeScript-інтерфейси.

| Стор | Поля та призначення |
| --- | --- |
| `folders` | `name`, `kind?`, `parentId`, `areaId?`, `lifeAreaId?`, `order`: вкладені папки |
| `goals` | `title`, `purposeUk`, `completionCriteriaUk`, `nextActionTaskId`, `timing`, `termStart?`, `termEnd?`, `folderId`, `lifeAreaId`, `state`, `archived`, `measure?`, `roadmapPeriod?`, `checkpoints?` |
| `projects` | `title`, `desiredOutcome`, `completionCriteria`, `targetDate`, `goalId?`, `folderId`, `lifeAreaId`, `state`, `archived`, `measure?`, `roadmapPeriod?`, `checkpoints?` |
| `stages` | `projectId`, `goalId?`, `title`, `expectedOutcome`, `targetDate`, `dependsOnStageIds?`, `order` |
| `tasks` | `title`, `state`, `priority`, `deadline`, `estimatedDurationMinutes`, `planningState`, `plannedDate`, `ownership`, `checklist`, `measure?`, `effort?` |
| `reservations` | `taskId`, `habitOccurrence?` з `entryId`, `habitId`, `localDate`; `interval`, `state`, `releaseMetadata` |
| `events` | `title`, `note`, `type`, `color`, `schedule`, `isBlocking`, `state`, `workProperties`, `areaId?`, `lifeAreaId?` |
| `shiftTemplates` | `name`, `code`, `startLocalTime`, `endLocalTime`, `endDateOffsetDays`, `color`, `note`, `kind?` |
| `dayOffAnnotations` | `localDate`, `sourceZone`, `code`, `note` |
| `habits` | `name`, `lifeAreaId`, `projectId`, `state`, `ruleRevisions`, `minimumVersionUk?`, `contextCueUk?`, `measure?` |
| `habitEntries` | `habitId`, `localDate`, `status`, `numericValue`, `note`, `recordedAt`, `ruleSnapshot?`, `dayOffSnapshot?` |
| `personalRecords` | `recordedAt`, `localDate`, `zoneId`, `text`, `mood`, `energy`, `stress`, `sleepMinutes?`, `sleepQuality?`, `tags` |
| `lifeAreaQuestions` | `questionTextUk`, `order`, `version`, `rating?`, `ratedAt?`, `focus?`, `goodEnough?`, `goodEnoughUk?`, `starterKeys?`, `archived?`, `mergedIntoId?` |
| `lifeAreaAssessments` | `recordedAt`, `periodStartLocalDate`, `periodEndLocalDate`, `scale?`, `answers`: знімки назв/визначень, `questionId`, `score`, `note`, `attentionNow?`, `usefulChangeUk?` |
| `inspirationItems` | `kind`, `title`, `contentText`, `linkUrl`, `mediaId`, `isFavorite`, `projectId`, `lifeAreaId?`, `goalId?`, `collection?` |
| `mediaMeta` | `mimeType`, `byteSize`, `width`, `height`, `sha256Hex`, `wasOptimized`, `optimizationNoteUk`, `createdAt` |
| `mediaBlobs` | `mimeType`, `bytes: Uint8Array`; той самий `id`, що в метаданих |
| `wishlistCategories` | `name`, `order` |
| `wishes` | `title`, `note`, `categoryId`, `timing`, `estimatedPrice`, `state`, `fulfilledAt`, `archived`, `purchaseStatus?`, `purchasedAt?`, `measure?`, `areaId?` |
| `settings` | `id: singleton`, `theme`, `timeZoneMode`, `manualTimeZone`, `textScale?`, `reducedMotionOverride`, `dailyPlans?`, `modules?`, `myLife?`, `demoBackup?`, `dbGeneration`, `appVersion`, `dbSchemaVersion` |
| `recoverySnapshots` | `createdAt`, `reason`, `dbSchemaVersion`, `appVersion`, `snapshot` |

Більшість доменних записів містить `createdAt`, `updatedAt`, `revision`; винятки видно в типах. Демо-записи можуть мати `isDemo`. Поля сумісності, зокрема дублікати посилань і текстів, залишаються частиною формату.

- `Task.ownership` має один варіант: `standalone`, `folder`, `goal` або `project`; для проєкту можливий `stageId`.
- `unplanned` і `timed` вимагають `plannedDate: null`; `date_only` вимагає дату й забороняє активні резервації завдання. Дедлайн не є резервацією.
- `ZonedInterval`: `startInstant`, `endInstant`, `originZone`, початкові й кінцеві локальні дата та час (`originStartLocalDate`, `originStartLocalTime`, `originEndLocalDate`, `originEndLocalTime`). Інтервал має додатну тривалість.
- Подія має `schedule.kind: timed` з інтервалом або `all_day` із `startLocalDate`, `endLocalDateExclusive`, `originZone`. Нічна зміна не дублюється при проєкції на наступний день.
- Стани цілі/проєкту: `idea`, `active`, `paused`, `completed`; `archived` зберігається окремо. Папки та залежності частин плану перевіряються на цикли, посилання на сутності перевіряються валідаторами.
- Правило звички зберігається в `ruleRevisions` із датою набуття чинності; `HabitEntry.status`: `completed`, `partial`, `skipped`, `no_entry`.
- UI оцінює сфери від 1 до 10; неоцінена сфера має `null`. Тип відповіді також допускає 0 для сумісності. Самопочуття (`mood`, `energy`, `stress`, `sleepQuality`) має шкалу 1–5.
- `ExactPrice`: `amountMinor` (ціле невід'ємне число), `amountDecimal` (десятковий рядок), `currency`. Підтримані UAH, USD, EUR, PLN, GBP, CHF, CZK, CAD, JPY; JPY має 0 дробових розрядів, інші 2.
- `Measure`: `unit`, `direction?: more | less`, `target?`, `current`, `log: { ts, delta }[]`. Внесок змінює поточне значення й додає запис журналу.

Резервна копія: ZIP `planui-backup`, `backupVersion: 1`, `dbSchemaVersion: 1`. `manifest.json` містить `format`, `backupVersion`, `appVersion`, `dbSchemaVersion`, `createdAt`, `entityCounts`, `files` (шлях, розмір, SHA-256, MIME). `data.json` містить 18 доменних колекцій і `settings`; зображення зберігаються в `media/<id>.jpg|png|webp`. Локальні точки відновлення не включені в доменний знімок.
Імпорт перевіряє архів, хеші, кількість записів і доменні інваріанти, створює захисний знімок і атомарно замінює дані. Зберігається до трьох точок відновлення. Читання сумісних попередніх форматів не видаляй.
