import type { WorkbookResult } from '../../../types';
import { buildAnnotatedWorkbookBuffer } from '../../../utils/excelReviewExport';

// exceljs's browser build hangs indefinitely on `xlsx.load()` for real-world
// workbooks, so annotating the original file must happen server-side where
// the Node build works reliably.
export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file');
  const workbookJson = formData.get('workbook');

  if (!(file instanceof Blob) || typeof workbookJson !== 'string') {
    return new Response('Expected "file" (xlsx) and "workbook" (JSON) form fields.', {
      status: 400,
    });
  }

  let workbook: WorkbookResult;
  try {
    workbook = JSON.parse(workbookJson) as WorkbookResult;
  } catch {
    return new Response('Invalid workbook JSON.', { status: 400 });
  }

  try {
    const originalFile = await file.arrayBuffer();
    const buffer = await buildAnnotatedWorkbookBuffer(originalFile, workbook);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
  } catch (err) {
    console.error('Annotated export failed:', err);
    return new Response('Failed to annotate the workbook.', { status: 500 });
  }
}
