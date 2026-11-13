import { useSelectionThumb } from '../../ui/motion';
import { Icon3D, type Icon3DName } from '../../ui/Icon3D';
import type { ImplementedCreationActionKind } from '../../state/shellStore';

const labels: Record<string, string> = { task: 'Завдання', event: 'Подія', habit: 'Звичка', shift: 'Зміна', project: 'Проєкт', folder: 'Папка', goal: 'Ціль', wish: 'Бажання', day_off: 'Вихідний', stage: 'Етап', wishlist_category: 'Категорія', inspiration: 'Натхнення', personal_record: 'Запис' };
export function TypeRail({ types, value, onChange, meta }: { types: readonly ImplementedCreationActionKind[]; value: ImplementedCreationActionKind; onChange: (type: ImplementedCreationActionKind) => void; meta: Record<ImplementedCreationActionKind, { iconName: Icon3DName; iconColor: string }> }) {
  const { containerRef, thumbRef } = useSelectionThumb(value, { dynamicLayout: true, layoutKey: types.join(',') });
  return <div ref={containerRef as React.Ref<HTMLDivElement>} className="create-type-rail" role="group" aria-label="Тип запису" data-testid="create-type-rail">
    <span ref={thumbRef} className="create-type-thumb" aria-hidden="true" />
    {types.map(type => <button key={type} type="button" aria-pressed={value === type} aria-label={labels[type]} onClick={() => onChange(type)} data-testid={`creation-type-pill-${type}`} className="create-type-button">
      <Icon3D name={meta[type].iconName} color={meta[type].iconColor} size={22} />
      {value === type && <span>{labels[type]}</span>}
    </button>)}
  </div>;
}
