/**
 * Gom danh mục route (`apiRoutes.getCatalog` của tutor-service) theo 2 cách:
 * - `module`: một nhóm cho mỗi module (tên module trùng nhau giữa các repo được gộp chung).
 * - `feature`: nhóm theo feature nghiệp vụ; trong mỗi feature, module của từng repo (svc) được tách riêng.
 */

/** Feature → các module liên quan. Giữ đồng bộ với `FEATURES` ở course-vps/lib/api-checklist/model.ts. */
export const FEATURES: { key: string; label: string; modules: string[] }[] = [
  { key: 'auth', label: 'Auth · xác thực & tài khoản', modules: ['auth', 'user'] },
  { key: 'admin', label: 'Admin · quản trị gia sư, học sinh', modules: ['admin', 'student'] },
  {
    key: 'class',
    label: 'Lớp học · buổi học, lịch, điểm danh',
    modules: ['class', 'session', 'schedule', 'attendance'],
  },
  {
    key: 'content',
    label: 'Giáo trình & bài tập',
    modules: ['curriculum', 'chapter', 'lesson', 'exercise', 'courseprogress'],
  },
  { key: 'finance', label: 'Báo cáo & học phí', modules: ['report', 'tuition', 'dashboard'] },
  { key: 'ai', label: 'AI & chat', modules: ['ai', 'agents', 'chat'] },
  { key: 'notify', label: 'Thông báo & email', modules: ['notification', 'email'] },
  {
    key: 'system',
    label: 'Hệ thống · upload, log, redis, health',
    modules: ['upload', 'redis', 'kafka', 'health', 'app', 'apiroutes'],
  },
];

const OTHER = { key: 'other', label: 'Khác' };

type CatalogItem = { svc: string; module: string } & Record<string, unknown>;
export type ApiCatalogSnapshot = { items: CatalogItem[] } & Record<string, unknown>;

/** Bỏ hậu tố như " (chưa đăng ký module)" và chuẩn hoá về chữ thường. */
const normalizeModule = (raw: string | null | undefined) =>
  String(raw ?? '')
    .replace(/\s+\(.*\)\s*$/, '')
    .trim()
    .toLowerCase();

/** Module của UI là đường dẫn trang (`/classes/[id]`) → lấy đoạn đầu (`classes`) để so với feature. */
const featureCandidate = (item: CatalogItem) => {
  const name = normalizeModule(item.module);
  if (item.svc !== 'ui') return name;
  return name.replace(/^\//, '').split('/')[0];
};

const featureOf = (item: CatalogItem) => {
  const candidate = featureCandidate(item);
  const singular = candidate.replace(/s$/, '');
  return (
    FEATURES.find((f) => f.modules.includes(candidate) || f.modules.includes(singular)) ?? OTHER
  );
};

const repoOrder = (order: unknown) => (Array.isArray(order) ? (order as string[]) : []);

/** Các trường metadata của snapshot, giữ nguyên cho cả 2 kiểu gom nhóm. */
function snapshotMeta({ items: _items, ...meta }: ApiCatalogSnapshot) {
  return meta;
}

export function groupCatalogByModule(catalog: ApiCatalogSnapshot) {
  const groups = new Map<
    string,
    { key: string; label: string; count: number; repos: string[]; items: CatalogItem[] }
  >();
  for (const item of catalog.items) {
    const key = normalizeModule(item.module) || '(không rõ)';
    let group = groups.get(key);
    if (!group) {
      group = { key, label: key, count: 0, repos: [], items: [] };
      groups.set(key, group);
    }
    group.count += 1;
    group.items.push(item);
    if (!group.repos.includes(item.svc)) group.repos.push(item.svc);
  }
  return {
    view: 'module' as const,
    ...snapshotMeta(catalog),
    total: catalog.items.length,
    groups: [...groups.values()],
  };
}

export function groupCatalogByFeature(catalog: ApiCatalogSnapshot) {
  const repoRank = (svc: string) => {
    const i = repoOrder(catalog.order).indexOf(svc);
    return i < 0 ? 999 : i;
  };
  const features = [...FEATURES, OTHER].map((f) => ({
    key: f.key,
    label: f.label,
    count: 0,
    modules: [] as { svc: string; module: string; count: number; items: CatalogItem[] }[],
  }));

  for (const item of catalog.items) {
    const feature = featureOf(item);
    const group = features.find((f) => f.key === feature.key)!;
    const module = normalizeModule(item.module) || '(không rõ)';
    let entry = group.modules.find((m) => m.svc === item.svc && m.module === module);
    if (!entry) {
      entry = { svc: item.svc, module, count: 0, items: [] };
      group.modules.push(entry);
    }
    entry.count += 1;
    entry.items.push(item);
    group.count += 1;
  }

  const moduleRank = (featureKey: string, module: string) => {
    const f = FEATURES.find((x) => x.key === featureKey);
    const i = f ? f.modules.indexOf(module.replace(/s$/, '')) : -1;
    return i < 0 ? 999 : i;
  };
  for (const f of features) {
    f.modules.sort(
      (a, b) =>
        moduleRank(f.key, a.module) - moduleRank(f.key, b.module) ||
        repoRank(a.svc) - repoRank(b.svc) ||
        a.module.localeCompare(b.module),
    );
  }

  return {
    view: 'feature' as const,
    ...snapshotMeta(catalog),
    total: catalog.items.length,
    groups: features.filter((f) => f.count > 0),
  };
}
