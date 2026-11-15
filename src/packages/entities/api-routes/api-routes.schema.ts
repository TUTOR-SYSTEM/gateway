import z from 'zod';

export const API_ROUTE_STATUSES = ['todo', 'pass', 'fail', 'blocked', 'skip'] as const;

/** Id của route trong api_routes (ví dụ "i77dff534df72d4"). */
export const apiRouteIdSchema = z
  .string()
  .regex(/^[\w-]{1,64}$/, { message: 'Mã route không hợp lệ' });

/** Doc của một route: status + các trường phụ (cases, note, checks, testedAt, ...). */
export const saveApiRouteResultSchema = z.object({
  status: z.enum(API_ROUTE_STATUSES),
  doc: z
    .record(z.string(), z.unknown())
    .refine((d) => JSON.stringify(d).length <= 100_000, { message: 'Doc quá lớn' }),
});

export type SaveApiRouteResultDto = z.infer<typeof saveApiRouteResultSchema>;

/** `GET /api-routes/catalog?view=module|feature` — bỏ trống = danh mục phẳng như cũ. */
export const API_CATALOG_VIEWS = ['module', 'feature'] as const;
export const apiCatalogQuerySchema = z.object({
  view: z.enum(API_CATALOG_VIEWS).optional(),
});

export type ApiCatalogQueryDto = z.infer<typeof apiCatalogQuerySchema>;
