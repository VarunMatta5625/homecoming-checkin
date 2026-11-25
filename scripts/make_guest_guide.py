"""Builds public/guest-list-guide.pdf, the instructions for filling in and importing the guest list.

  python3 scripts/make_guest_guide.py

Needs: pip install reportlab. Keep the column table in step with FIELDS in src/lib/guestImport.ts.
"""

from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Table, TableStyle

RED = colors.HexColor('#981F2A')
GREY = colors.HexColor('#6B6B70')
LINE = colors.HexColor('#D8D8DD')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'guest-list-guide.pdf'

ss = getSampleStyleSheet()
body = ParagraphStyle('body', parent=ss['BodyText'], fontName='Helvetica', fontSize=10, leading=14.5, spaceAfter=4)
small = ParagraphStyle('small', parent=body, fontSize=8.6, leading=11.5)
h1 = ParagraphStyle('h1', parent=body, fontName='Helvetica-Bold', fontSize=21, leading=25, textColor=RED, spaceAfter=2)
sub = ParagraphStyle('sub', parent=body, textColor=GREY, spaceAfter=10)
h2 = ParagraphStyle('h2', parent=body, fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=RED, spaceBefore=12, spaceAfter=4)
cellb = ParagraphStyle('cellb', parent=small, fontName='Helvetica-Bold')

FIELDS = [
    ('Name', 'Required', "The alumnus's full name, at least 2 letters.", 'Ravi Kumar'),
    ('Batch year', 'Required', 'A 4-digit year from 1984 to 2026.', '2008'),
    ('Mobile', 'Required', '10 digits. "+91" in front is fine. Set the column to Text first so Excel keeps every digit.', '9876543210'),
    ('School', 'Optional', 'Exactly one of: School of Technology; School of Science; School of Business; School of Pharmacy; School of Law; School of Architecture; GITAM Dental College. The short form (for example "Technology") is also accepted. Leave blank if unknown.', 'School of Technology'),
    ('Department', 'Optional', 'Free text. Leave blank if unknown.', 'Mechanical'),
    ('Course', 'Optional', 'Free text, for example B.Tech or MBA. Leave blank if unknown.', 'B.Tech'),
    ('Email', 'Optional', 'A normal email address, or blank.', 'ravi@example.com'),
    ('Spouse', 'Optional', 'Yes, No or Maybe. Blank means No.', 'Yes'),
    ('Children', 'Optional', 'A whole number from 0 to 6. Blank means 0.', '2'),
    ('Parking', 'Optional', 'None, 2-wheeler or 4-wheeler. Blank means None.', '4-wheeler'),
    ('Accommodation', 'Optional', 'Yes, No or Maybe, or blank.', 'No'),
]


def P(t, s=body):
    return Paragraph(t, s)


def steps(items):
    return ListFlowable([ListItem(P(t), leftIndent=14) for t in items], bulletType='1', bulletFontName='Helvetica-Bold', bulletFontSize=10, leftIndent=16)


def bullets(items):
    return ListFlowable([ListItem(P(t), leftIndent=14) for t in items], bulletType='bullet', start='•', leftIndent=14)


def table(rows, widths):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F2F2F7')), ('LINEBELOW', (0, 0), (-1, 0), 0.8, RED),
    ]))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(GREY)
    canvas.drawString(18 * mm, 10 * mm, 'Homecoming 2026 Check-in  |  Guest list import guide')
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, 'Page %d' % doc.page)
    canvas.restoreState()


story = [
    P('Guest list import guide', h1),
    P('Homecoming 2026 Check-in. For the organisers who load the real guest list into the app.', sub),

    P('What this does', h2),
    P("You fill in one spreadsheet, one row per alumnus, and upload it from the app. The app checks every row first and shows you what to fix. "
      "Once the file is clean, it creates the guests and a pass code and QR code for each one. Volunteers' phones pick the new guests up the next time they sync. "
      'You need an <b>admin</b> account to do this.'),

    P('Step by step', h2),
    steps([
        'In the app, tap the counter button at the top of the screen to open Account, then <b>Import guests</b>. Tap <b>Download the template (CSV)</b>. It is an empty sheet with the column headings already in place.',
        'Open the file in Excel or Google Sheets. <b>Before you type any mobile numbers</b>, select the Mobile column and set its format to <b>Text</b> '
        '(Excel: right-click the column, Format Cells, Text). Otherwise Excel turns long numbers into things like 9.87654E+09 and loses digits.',
        'Fill in one row per alumnus. Do not rename, reorder or delete the headings. Leave optional cells blank when you do not know the answer. '
        'The table below lists what each column accepts.',
        'Save as <b>CSV UTF-8 (Comma delimited) (*.csv)</b>. In Excel: File, Save As, then choose that type. In Google Sheets: File, Download, Comma Separated Values (.csv).',
        'Back in the app, tap <b>Choose the filled CSV</b> and pick the file. The app lists every row that has a problem, with its row number and what to change. '
        'Fix them in your spreadsheet, save, and choose the file again. Nothing is sent to the server while there are problems.',
        'When the check is clean, choose <b>Add</b> or <b>Replace</b> (see below), then tap <b>Import</b>. Large lists take a few seconds.',
        'Afterwards, tap <b>Download the pass list</b> to get the pass codes and QR tokens for sending passes and printing QR codes.',
    ]),

    P('The columns', h2),
]

rows = [[P('Column', cellb), P('', cellb), P('What to type', cellb), P('Example', cellb)]]
for name, req, what, ex in FIELDS:
    rows.append([P(name, cellb), P(req, small), P(what, small), P(ex or '(blank)', small)])
story += [table(rows, [29 * mm, 17 * mm, 94 * mm, 34 * mm])]

story += [
    P('Example rows', h2),
    P('This is how three rows might look (with the headings above them in your file):', body),
]
ex = [[P(h, cellb) for h in ['Name', 'Batch year', 'Mobile', 'School', 'Course', 'Spouse', 'Children', 'Parking']]]
for r in [
    ['Ravi Kumar', '2008', '9876543210', 'School of Technology', 'B.Tech', 'Yes', '2', '4-wheeler'],
    ['Anita Rao', '1995', '+91 98765 00000', 'School of Business', 'MBA', '', '', ''],
    ['Suresh Babu', '2015', '9876500001', 'Technology', 'B.Tech', 'Maybe', '0', '2-wheeler'],
]:
    ex.append([P(c, small) for c in r])
story += [table(ex, [27 * mm, 17 * mm, 28 * mm, 34 * mm, 18 * mm, 15 * mm, 16 * mm, 19 * mm]),
          P('Only 8 of the 11 columns are shown. The rest (Department, Email, Accommodation) work the same way.', small)]

story += [
    P('Add or Replace', h2),
    bullets([
        '<b>Add</b> keeps the guests already in the app and adds the new ones. Use it for the first real import into an empty list, for splitting a very large file, or for late registrations.',
        '<b>Replace</b> removes every guest now in the app, then adds the file. Use it to throw away the practice guests and load the real list, or to start again after a mistake.',
        'Replace is refused once any check-in has been recorded, and once the event is marked live. This protects real scan history. '
        'While testing, clear the test activity first (the database README has the steps), then use Replace.',
        'One file can hold up to 10,000 guests. Either everything is imported or nothing is: a file with a problem never half-loads.',
    ]),

    P('Things that commonly go wrong', h2),
    bullets([
        '<b>Mobile shows as 9.87654E+09.</b> Excel changed the number. Set the Mobile column to Text, then type or paste the numbers again.',
        '<b>School is rejected.</b> It must match the list above (capital letters do not matter, but the spelling must).',
        '<b>Accented letters look odd.</b> Save as <b>CSV UTF-8</b>, not plain CSV.',
        '<b>"This looks like an example row".</b> Delete any sample rows you copied in.',
        '<b>Same mobile on two rows.</b> Not an error: both guests are created, and the second is flagged on the Review screen for staff to check. A husband and wife sharing a phone, or one guest entered twice, look the same to the app.',
        '<b>A column is skipped.</b> The app ignores columns it does not know, and tells you which.',
    ]),

    P('The pass list', h2),
    P('<b>Download the pass list</b> gives a CSV of every current guest: pass code, QR token, name, batch, school, department, course, last 4 digits, spouse, children, party size, parking, and the full mobile and email. '
      'Use it to send passes and to print QR codes. The first twelve columns are exactly what <i>scripts/test_passes.py</i> reads.'),
    P('The pass list contains personal details. Keep the file on a trusted computer, share it only with the people who send the passes, and delete it when the job is done. '
      'The app records each download in the audit log, with the time and who did it.'),

    P('Privacy', h2),
    P("Do not email the filled guest list or the pass list around, and do not upload them anywhere except this app. The app never keeps full mobile numbers or emails on volunteers' phones: "
      'phones hold only the last 4 digits. Staff and admins can open a full contact, and each look-up is recorded.'),
]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title='Guest list import guide', author='Homecoming 2026 Check-in')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('wrote', OUT)
