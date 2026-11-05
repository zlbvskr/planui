import React, { useRef } from 'react';
import { Project } from '../../domain/types';
import {
  ValidatedMediaPreparationResult,
  validateAndPrepareRasterMedia,
  validateSafeHttpUrl,
} from '../../domain/personalSpace';
import { SelectField } from '../../ui';
import { InputField } from '../ui/primitives';

export interface WishExtrasValue {
  linkUrl: string;
  projectId: string;
  mediaId: string | null;
  preparedMedia: ValidatedMediaPreparationResult | null;
  validating?: boolean;
  imageError?: string | null;
}

export function emptyWishExtras(projectId = ''): WishExtrasValue {
  return {
    linkUrl: '',
    projectId,
    mediaId: null,
    preparedMedia: null,
    validating: false,
    imageError: null,
  };
}

export function resolveWishExtras(value: WishExtrasValue): {
  linkUrl: string | null;
  projectId: string | null;
  mediaId: string | null;
} {
  return {
    linkUrl: value.linkUrl.trim() ? validateSafeHttpUrl(value.linkUrl) : null,
    projectId: value.projectId || null,
    mediaId: value.preparedMedia?.meta.id ?? value.mediaId ?? null,
  };
}

export function WishExtrasFields({
  value,
  onChange,
  projects,
  onError,
}: {
  value: WishExtrasValue;
  onChange: (next: WishExtrasValue) => void;
  projects: readonly Project[];
  onError: (msg: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const preparedMedia = await validateAndPrepareRasterMedia({
        id,
        bytes,
        declaredMimeType: file.type || undefined,
        nowIso: new Date().toISOString(),
      });
      onChange({ ...value, mediaId: preparedMedia.meta.id, preparedMedia });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Помилка завантаження файлу.');
    }
  };

  return (
    <div className="space-y-3">
      <InputField
        label="Посилання (http/https)"
        value={value.linkUrl}
        onChange={(e) => onChange({ ...value, linkUrl: e.target.value })}
        placeholder="https://example.com"
      />
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={pickFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="min-h-[44px] px-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)]"
        >
          {value.mediaId ? 'Змінити фото' : 'Обрати фото'}
        </button>
        {value.mediaId && (
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, mediaId: null, preparedMedia: null })
            }
            className="min-h-[44px] px-3 rounded-xl text-xs text-[var(--color-danger)] font-medium"
          >
            Прибрати фото
          </button>
        )}
      </div>
      <div className="rounded-[20px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] overflow-hidden">
        <SelectField
          label="Проєкт"
          value={value.projectId}
          onChange={(e) => onChange({ ...value, projectId: e.target.value })}
          options={[
            { value: '', label: 'Без проєкту' },
            ...projects
              .filter((p) => !p.archived || p.id === value.projectId)
              .map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
      </div>
    </div>
  );
}
