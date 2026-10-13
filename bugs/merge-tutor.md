# Merge conflict resolution — tutor-service `chapter.service.ts` (TUT3-02)

Ngày: 2026-10-13. Repo: `tutor/tutor` (branch `chore/sync-2026-10-11`).

## Hiện trạng
- `HEAD` (4581e83 `fixbug`) đã commit marker conflict trong `src/features/chapter/chapter.service.ts`
  (`<<<<<<< Updated upstream` / `=======` / `>>>>>>> Stashed changes`), trong `createChapterService`.
- Nhánh "Updated upstream": `await this.assertCurriculumOwner(curriculumId, userId);`
  (kiểm UUID user + chủ sở hữu giáo trình, miss → 404 `CURRICULUM_NOT_FOUND`).
- Nhánh "Stashed changes" (`stash@{0}`, "WIP on chore/sync-2026-10-11"): chỉ kiểm curriculum tồn tại
  qua `chapterRepository.curriculumExists(...)`, KHÔNG kiểm owner.

## Quyết định
- Giữ nhánh **upstream** (`assertCurriculumOwner`), bỏ nhánh stash. Lý do: DEV playbook / rule
  `nestjs-feature-pattern.md` yêu cầu chapter write phải authorize qua curriculum owner (`userId`);
  nhánh stash bỏ kiểm owner nên mọi user có thể tạo chapter vào giáo trình của người khác.
- Không chạm `git stash` (không drop/pop/apply). `stash@{0}` vẫn còn nguyên để tham chiếu.
- `ChapterRepository.curriculumExists` (đã có trong HEAD) được giữ lại, hiện không còn được service
  gọi. Không xoá trong bước này.

## Thay đổi
- `src/features/chapter/chapter.service.ts`: xoá 3 marker + nhánh stash, còn lại
  `await this.assertCurriculumOwner(curriculumId, userId);`.

## Xác nhận
- `git grep -n '^<<<<<<< '` trên `src/` và `test/`: không còn kết quả.
- `git grep -n '^>>>>>>> '` và `git grep -n '^=======$'`: không còn kết quả.
- `bun run typecheck` (tutor): exit 0.

## Hệ quả với test (TEST cần cập nhật)
- `test/features/chapter/chapter.curriculum-check.spec.ts` (commit 4581e83) mô tả hành vi của nhánh
  stash (`curriculumExists`, AC1/AC2). Hành vi này không còn đúng. Spec cũng chưa mock
  `CurriculumRepository` nên suite lỗi khi load (`uuid` ESM qua `curriculum.repository`).
