"""Printable QR test sheets for rehearsals (fake data only).

Needs: pip install reportlab

  python3 scripts/test_passes.py valid guests.csv out-valid.pdf
  python3 scripts/test_passes.py invalid out-wrong-entries.pdf

guests.csv comes from the Supabase SQL editor (download the result as CSV):

  select pass_code, qr_token, lead_name, batch_year, school, department, course,
         mobile_last4, spouse, children, party_size, parking
  from parties where source = 'booked' and deleted_at is null order by pass_code limit 50;

The sheets carry live QR tokens for the hosted database. Keep them out of the repo (test-passes/ and *.csv are gitignored).
"""

import sys, csv, secrets
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

W, H = A4
M = 26
CW, CH = (W - 2*M) / 2, (H - 2*M) / 2
ALPHA = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

def draw_qr(c, text, x, y, size):
    w = qr.QrCodeWidget(text, barLevel='M')
    b = w.getBounds()
    d = Drawing(size, size, transform=[size/(b[2]-b[0]), 0, 0, size/(b[3]-b[1]), 0, 0])
    d.add(w)
    renderPDF.draw(d, c, x, y)

def slot(i):
    col, row = i % 2, (i // 2) % 2
    return M + col*CW, H - M - (row+1)*CH

def card_frame(c, x, y):
    c.setStrokeColorRGB(.7, .7, .7); c.setDash(3, 3); c.setLineWidth(.6)
    c.rect(x+6, y+6, CW-12, CH-12); c.setDash()

def centered(c, x, y, s, font, size, rgb=(0,0,0)):
    c.setFillColorRGB(*rgb); c.setFont(font, size)
    c.drawCentredString(x + CW/2, y, s)

def lines_block(c, x, y_top, rows, lh=15):
    y = y_top
    for k, v in rows:
        c.setFillColorRGB(.45,.45,.45); c.setFont('Helvetica', 8.5); c.drawString(x+26, y, k)
        c.setFillColorRGB(0,0,0); c.setFont('Helvetica-Bold', 10); c.drawString(x+98, y, v)
        y -= lh

def party_desc(spouse, kids):
    bits = ['Lead']
    if spouse == 'yes': bits.append('spouse')
    if spouse == 'maybe': bits.append('spouse (maybe)')
    if kids: bits.append('%d child%s' % (kids, '' if kids == 1 else 'ren'))
    return ' + '.join(bits)

def valid(rows, out):
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle('Homecoming 2026 - test passes (valid)')
    for n, r in enumerate(rows):
        if n and n % 4 == 0: c.showPage()
        x, y = slot(n % 4)
        card_frame(c, x, y)
        size = 150
        draw_qr(c, 'GH26:' + r['qr_token'], x + (CW-size)/2, y + CH - 22 - size, size)
        centered(c, x, y + CH - 22 - size - 18, r['pass_code'], 'Helvetica-Bold', 17)
        centered(c, x, y + CH - 22 - size - 40, r['lead_name'], 'Helvetica-Bold', 13)
        spouse, kids, size_ = r['spouse'], int(r['children']), int(r['party_size'])
        pdesc = ('Party of up to %d' % size_) if spouse == 'maybe' else ('Party of %d' % size_)
        rows_ = [
            ('Batch', 'Batch of %s' % r['batch_year']),
            ('Course', r['course'] or '-'),
            ('School', r['school'] or '-'),
            ('Department', r['department'] or '-'),
            ('Party', pdesc),
            ('Members', party_desc(spouse, kids)),
            ('Parking', (r['parking'] or 'none').replace('_', ' ')),
            ('Mobile', 'ends ' + (r['mobile_last4'] or '----')),
            ('Dinner left', '%d of %d (fresh pass)' % (size_, size_)),
        ]
        lines_block(c, x, y + CH - 22 - size - 62, rows_)
        c.setFillColorRGB(.5,.5,.5); c.setFont('Helvetica', 7.5)
        c.drawCentredString(x + CW/2, y + 14, 'TEST DATA - expect: Valid entry, then dinner')
    c.save()

def invalid(out):
    items = []
    for _ in range(4):
        tok = ''.join(secrets.choice('ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz23456789-_') for _ in range(22))
        items.append(('GH26:' + tok, 'GH26 token not in database', 'Pass not found', 'Unknown pass'))
    items += [
        ('https://example.com/pay', 'Website link', 'Not a Homecoming pass', 'Unrecognised QR code'),
        ('upi://pay?pa=shop@upi&pn=Test%20Shop&am=100', 'Payment (UPI) code', 'Not a Homecoming pass', 'Unrecognised QR code'),
        ('hello world', 'Plain text', 'Not a Homecoming pass', 'Unrecognised QR code'),
        ('GH25:' + secrets.token_urlsafe(16), 'Last year prefix (GH25)', 'Not a Homecoming pass', 'Unrecognised QR code'),
    ]
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle('Homecoming 2026 - test passes (wrong entries)')
    for n, (payload, kind, label, sub) in enumerate(items):
        if n and n % 4 == 0: c.showPage()
        x, y = slot(n % 4)
        card_frame(c, x, y)
        size = 150
        draw_qr(c, payload, x + (CW-size)/2, y + CH - 22 - size, size)
        centered(c, x, y + CH - 22 - size - 24, 'WRONG ENTRY', 'Helvetica-Bold', 17, (.75, 0, 0))
        centered(c, x, y + CH - 22 - size - 46, kind, 'Helvetica-Bold', 12)
        centered(c, x, y + CH - 22 - size - 72, 'App should show:', 'Helvetica', 9, (.4,.4,.4))
        centered(c, x, y + CH - 22 - size - 88, label, 'Helvetica-Bold', 12)
        centered(c, x, y + CH - 22 - size - 104, sub, 'Helvetica', 10, (.3,.3,.3))
        centered(c, x, y + 14, 'TEST DATA - not issued to anyone', 'Helvetica', 7.5, (.5,.5,.5))
    c.save()

if sys.argv[1] == 'valid':
    valid(list(csv.DictReader(open(sys.argv[2])))[:50], sys.argv[3])
else:
    invalid(sys.argv[2])
