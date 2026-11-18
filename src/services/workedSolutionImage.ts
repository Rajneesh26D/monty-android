import type { MCQ } from '../../shared/monty';
import type { PageData } from '../pdf/parser';
import { openPdf } from '../pdf/reader';
import { workedSolutionRegions, type SolutionRegionIndex } from '../pdf/workedQuestions';
import { readAttachment, readJob, readStoredState, saveJob } from '../storage/repository';

export async function workedSolutionImages(
  question: Pick<MCQ, 'id' | 'number' | 'page' | 'sourceSolution'>,
  attachmentId?: string,
) {
  if (!question.sourceSolution) return [];
  if (!attachmentId) {
    const state = await readStoredState();
    attachmentId = Object.values(state?.monty?.attachments ?? {}).find(
      (file) =>
        file.kind === 'practice' && !!file.bankId && question.id.startsWith(file.bankId + '-q'),
    )?.id;
  }
  if (!attachmentId) return [];
  const key = `worked-solution-regions-v1-${attachmentId}`;
  const file = await readAttachment(attachmentId);
  const pdf = await openPdf(file.bytes);
  try {
    let index = await readJob<SolutionRegionIndex>(key).catch(() => undefined);
    if (!index && pdf.count <= 500) {
      const pages: PageData[] = [];
      for (let n = 1; n <= pdf.count; n++)
        pages.push(
          (await readJob<PageData>(`page-v2-${attachmentId}-${n}`)) ?? (await pdf.page(n)),
        );
      index = workedSolutionRegions(pages);
      await saveJob(key, index).catch(() => {});
    }
    const regions = index?.[`${question.page}-${question.number}`] ?? [];
    if (
      !question.sourceSolution.pages.every((page) => regions.some((region) => region.page === page))
    )
      return [];
    const images = [];
    for (const region of regions)
      images.push({
        page: region.page,
        url: await pdf.textRegionImage(region.page, region.bounds),
      });
    return images;
  } finally {
    await pdf.close();
  }
}
