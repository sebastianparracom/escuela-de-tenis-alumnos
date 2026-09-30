import { Badge, Group, Row, TimeBlock } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import { hhmm, localMinute } from "@/lib/time";
import type { ClassItem } from "@/server/queries";

const TAG = {
  individual: <Badge tone="green">Individual</Badge>,
  grupal: <Badge tone="blue">Grupal</Badge>,
  alquiler: <Badge tone="amber">Alquiler</Badge>,
};

export function ClassList({ items, showDate = false, showStatus = false }: { items: ClassItem[]; showDate?: boolean; showStatus?: boolean }) {
  return (
    <Group>
      {items.map((c) => (
        <Row
          key={c.id}
          href={`/reservas/${c.id}`}
          leading={<TimeBlock top={showDate ? shortDate(c.localDate) : hhmm(localMinute(c.startsAt))} bottom={showDate ? hhmm(localMinute(c.startsAt)) : undefined} />}
          title={c.title}
          subtitle={`${c.court}${c.nightTurns > 0 ? " · nocturna" : ""}`}
          trailing={showStatus ? <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge> : TAG[c.kind]}
        />
      ))}
    </Group>
  );
}
