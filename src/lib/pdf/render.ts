import 'server-only';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { InvoiceDocument } from './InvoiceDocument';
import type { InvoicePdfData } from './types';

/** Renders the invoice PDF to a Buffer (server only; @react-pdf/renderer is a server external package). */
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  // InvoiceDocument renders a <Document>, which is what renderToBuffer expects.
  const element = createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
