import type { DischargeDocument } from '../types/discharge';

// Downloads use the saved, approved server record.
export async function generateDischargePdf(doc: DischargeDocument): Promise<void> {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/generate-approved-pdf';
  form.target = '_self';
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'documentId';
  input.value = doc.id;
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();

  setTimeout(() => {
    form.remove();
  }, 2000);
}
