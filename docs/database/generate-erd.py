#!/usr/bin/env python3
"""Local, vector PDF export of this repository's DBML subset. No network calls.

Requires reportlab and pypdf. Unknown DBML syntax fails instead of being omitted.
See erd-export.md for regeneration and visual review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader
import reportlab
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

FONT_DIR = Path(reportlab.__file__).resolve().parent / 'fonts'
pdfmetrics.registerFont(TTFont('Body', str(FONT_DIR / 'Vera.ttf')))
pdfmetrics.registerFont(TTFont('Body-Bold', str(FONT_DIR / 'VeraBd.ttf')))

ROOT = Path(__file__).resolve().parent
W, H = 1920, 1080
NAVY = HexColor('#16324d')
TEAL = HexColor('#008494')
INK = HexColor('#254159')
MUTED = HexColor('#516b80')
LINE = HexColor('#cbdce7')
PALE = HexColor('#f1f6fa')
HIGHLIGHT = HexColor('#e2f4f0')
ESTIMATE_FIELDS = {
    'route_distance_km', 'estimated_duration_minutes', 'estimated_duration_source',
    'estimate_average_speed_kmh', 'estimate_policy_version', 'admin_eta_minutes',
    'eta_source', 'eta_calculated_at', 'eta_updated_at', 'eta_overridden_by_user_id',
}


@dataclass
class Column:
    name: str
    dtype: str
    attrs: list[str]

    def has(self, flag):
        return flag in self.attrs

    @property
    def required(self):
        return self.has('pk') or self.has('not null')

    @property
    def default(self):
        return next((a[8:].strip() for a in self.attrs if a.startswith('default:')), None)


@dataclass
class Table:
    name: str
    columns: list[Column] = field(default_factory=list)
    indexes: list[tuple[list[str], list[str]]] = field(default_factory=list)

    def col(self, name):
        return next(c for c in self.columns if c.name == name)

    def pk(self, name):
        return self.col(name).has('pk') or any(name in cols and 'pk' in attrs for cols, attrs in self.indexes)

    def unique(self, name):
        return self.col(name).has('pk') or self.col(name).has('unique') or any(cols == [name] and ('pk' in attrs or 'unique' in attrs) for cols, attrs in self.indexes)


@dataclass
class Ref:
    id: str
    child: str
    column: str
    operator: str
    parent: str
    target: str


def split_attrs(text):
    result, start, quote, depth = [], 0, None, 0
    for i, ch in enumerate(text):
        if quote:
            if ch == quote and (i == 0 or text[i - 1] != '\\'):
                quote = None
        elif ch in "'\"":
            quote = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif ch == ',' and depth == 0:
            result.append(text[start:i].strip())
            start = i + 1
    assert not quote and depth == 0, 'Unbalanced attributes'
    if text.strip():
        result.append(text[start:].strip())
    return result


def read_dbml(path):
    """Parse explicit Table/Enum/Ref/index declarations used by hired.dbml.

    This is intentionally not a general DBML parser. Reject unsupported syntax.
    """
    tables, enums, refs = {}, {}, []
    current = None
    mode = None
    in_indexes = False
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        s = raw.strip()
        if not s or s.startswith('//'):
            continue
        if current is None:
            match = re.fullmatch(r'(Table|Enum) ([a-z][a-z0-9_]*) \{', s)
            if match:
                mode, current = match.groups()
                if mode == 'Table':
                    assert current not in tables
                    tables[current] = Table(current)
                else:
                    assert current not in enums
                    enums[current] = []
                continue
            match = re.fullmatch(r'Ref: (\w+)\.(\w+) (>|-) (\w+)\.(\w+)', s)
            if match:
                refs.append(Ref(f'R{len(refs) + 1:02}', *match.groups()))
                continue
            raise ValueError(f'Unsupported top-level DBML at line {number}: {s}')
        if s == '}':
            if in_indexes:
                in_indexes = False
            else:
                current = mode = None
            continue
        if mode == 'Enum':
            assert re.fullmatch(r'[a-z][a-z0-9_]*', s), (number, s)
            enums[current].append(s)
            continue
        if s == 'indexes {':
            assert not in_indexes
            in_indexes = True
            continue
        if in_indexes:
            match = re.fullmatch(r'\(([^)]+)\)(?: \[(.*)\])?', s)
            if not match:
                raise ValueError(f'Unsupported index at line {number}: {s}')
            cols = [x.strip() for x in match[1].split(',')]
            attrs = split_attrs(match[2] or '')
            assert all(a in ['pk', 'unique'] for a in attrs)
            tables[current].indexes.append((cols, attrs))
            continue
        match = re.fullmatch(r'([a-z][a-z0-9_]*) ([a-z][a-z0-9_]*(?:\([0-9,]+\))?)(?: \[(.*)\])?', s)
        if not match:
            raise ValueError(f'Unsupported column at line {number}: {s}')
        name, dtype, attrs = match.groups()
        attributes = split_attrs(attrs or '')
        assert all(a in ['pk', 'unique', 'not null', 'increment'] or a.startswith(('note:', 'default:')) for a in attributes), (number, attributes)
        assert not any(c.name == name for c in tables[current].columns)
        tables[current].columns.append(Column(name, dtype, attributes))
    assert current is None and not in_indexes, 'Unclosed DBML block'
    for table in tables.values():
        for cols, _ in table.indexes:
            for col in cols:
                table.col(col)
    for ref in refs:
        child, parent = tables[ref.child].col(ref.column), tables[ref.parent].col(ref.target)
        assert child.dtype == parent.dtype, ref
        assert tables[ref.parent].unique(ref.target), ref
        if ref.operator == '-':
            assert tables[ref.child].unique(ref.column), ref
    return tables, enums, refs


def text(c, x, top, value, size=14, font='Body', color=INK):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, H - top, value)


def wrap(value, width, font, size):
    lines, line = [], ''
    for word in value.split():
        candidate = (line + ' ' + word).strip()
        if line and stringWidth(candidate, font, size) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
        assert stringWidth(word, font, size) <= width, f'Unbreakable text: {word}'
    if line:
        lines.append(line)
    return lines


class Export:
    def __init__(self, source, output, asof):
        self.tables, self.enums, self.refs = read_dbml(source)
        self.sha = hashlib.sha256(source.read_bytes()).hexdigest()
        self.source, self.output, self.asof = source, output, asof
        self.pages, self.rects = [], {}
        os.environ['SOURCE_DATE_EPOCH'] = str(int(datetime.fromisoformat(asof).replace(tzinfo=timezone.utc).timestamp()))
        self.c = canvas.Canvas(str(output), pagesize=(W, H), pageCompression=1, invariant=1)
        self.c.setTitle(f'HireD Phase 1 Database ERD - proposed design - {asof}')
        self.c.setAuthor('BASAP')
        self.c.setSubject(f'Local export of hired.dbml; SHA-256 {self.sha}')

    def start(self, title, subtitle):
        c = self.c
        self.pages.append(title)
        text(c, 64, 58, 'HIRED / BASAP', 16, 'Body-Bold', TEAL)
        text(c, 64, 102, title, 34, 'Body-Bold', NAVY)
        text(c, 64, 137, subtitle, 17, color=MUTED)
        c.setStrokeColor(LINE)
        c.line(64, 1018, W - 64, 1018)
        text(c, 64, 1043, f'Proposed design - not an implemented database | {self.asof} | hired.dbml | SHA-256 {self.sha[:16]}', 12, color=MUTED)
        text(c, W - 95, 1043, str(len(self.pages)), 13, color=MUTED)
        c.bookmarkPage(f'page-{len(self.pages)}')
        c.addOutlineEntry(title, f'page-{len(self.pages)}', level=0)

    def end(self):
        self.c.showPage()

    def legend(self):
        text(self.c, 64, 170, 'PK primary key | UQ single-column unique | NN required | NULL optional | FK Rxx exact target on page 7 | Green rows: estimate fields', 14, color=MUTED)

    def table_height(self, table, width=576):
        metadata = self.metadata(table)
        lines = sum(len(wrap(line, width - 24, 'Body', 12)) for line in metadata)
        return 56 + len(table.columns) * 16 + (lines * 15 + 12 if lines else 8)

    def metadata(self, table):
        result = []
        defaults = [f'{c.name}={c.default}' for c in table.columns if c.default is not None]
        if defaults:
            result.append('Defaults: ' + '; '.join(defaults))
        for cols, attrs in table.indexes:
            label = 'Composite PK' if 'pk' in attrs else 'UQ index' if 'unique' in attrs else 'Index'
            result.append(label + ': (' + ', '.join(cols) + ')')
        if any(c.has('increment') for c in table.columns):
            result.append('Increment: ' + ', '.join(c.name for c in table.columns if c.has('increment')))
        return result

    def card(self, name, x, top, width=576):
        c, table = self.c, self.tables[name]
        height = self.table_height(table, width)
        assert top + height <= 994, (name, top, height)
        self.rects[name] = (len(self.pages), x, top, width, height)
        c.setFillColor(NAVY)
        c.rect(x, H - top - 32, width, 32, fill=1, stroke=0)
        text(c, x + 12, top + 23, name, 19, 'Body-Bold', white)
        text(c, x + 12, top + 49, 'COLUMN', 11, 'Body-Bold', MUTED)
        text(c, x + 310, top + 49, 'POSTGRESQL TYPE', 11, 'Body-Bold', MUTED)
        text(c, x + 480, top + 49, 'KEY / NULL', 11, 'Body-Bold', MUTED)
        y = top + 56
        for index, column in enumerate(table.columns):
            if name in ['orders', 'trips'] and column.name in ESTIMATE_FIELDS:
                fill = HIGHLIGHT
            else:
                fill = PALE if index % 2 == 0 else white
            c.setFillColor(fill)
            c.rect(x, H - y - 16, width, 16, fill=1, stroke=0)
            flags = []
            if table.pk(column.name):
                flags.append('PK')
            elif column.has('unique'):
                flags.append('UQ')
            flags.append('NN' if column.required else 'NULL')
            flags.extend('FK ' + r.id for r in self.refs if r.child == name and r.column == column.name)
            for value, offset, available, font, size in [
                (column.name, 12, 288, 'Body-Bold' if len(flags) > 1 else 'Body', 14),
                (column.dtype, 310, 162, 'Body', 12),
                (' '.join(flags), 480, width - 488, 'Body', 11),
            ]:
                assert stringWidth(value, font, size) <= available, (name, value)
                text(c, x + offset, y + 12, value, size, font, TEAL if offset == 480 else INK)
            y += 16
        for line in self.metadata(table):
            for part in wrap(line, width - 24, 'Body', 12):
                text(c, x + 12, y + 17, part, 12, color=MUTED)
                y += 15
        c.setStrokeColor(LINE)
        c.rect(x, H - top - height, width, height, fill=0, stroke=1)
        return height

    def field_page(self, title, subtitle, columns):
        self.start(title, subtitle)
        self.legend()
        for index, names in enumerate(columns):
            y = 194
            for name in names:
                y += self.card(name, 64 + index * 608, y) + 26
        self.end()

    def overview(self):
        self.start('Core relationships and lifecycle', f'Selected declared foreign keys; every table and column follows on pages 2-6, all {len(self.refs)} references on page 7, enums on page 8.')
        c = self.c
        nodes = {
            'companies': (80, 270, 'Company scope / rates'),
            'orders': (440, 270, 'Intake / decision / estimate'),
            'trips': (800, 270, 'Execution / closure / estimate'),
            'trip_payroll_records': (1160, 270, 'Frozen applied split'),
            'wallet_transactions': (1520, 270, 'Immutable earnings ledger'),
            'statements': (80, 580, 'Monthly frozen content'),
            'statement_items': (440, 580, 'Copied payroll values'),
            'drivers': (800, 580, 'Operational activation'),
            'trip_assignments': (1160, 580, 'Assignment history'),
            'trip_reports': (1520, 580, 'Immutable JSON snapshot'),
            'statement_approvals': (80, 825, 'Creator + other admin rule'),
            'notifications': (440, 825, 'Transactional email outbox'),
            'trip_expenses': (1160, 825, 'Confirmed before closure'),
        }
        # Each route is tied to an actual declared child FK, not an inferred rule.
        routes = [
            ('orders', 'company_id', [(370, 310), (440, 310)], (389, 296)),
            ('trips', 'order_id', [(730, 310), (800, 310)], (740, 296)),
            ('trip_payroll_records', 'trip_id', [(1090, 310), (1160, 310)], (1097, 296)),
            ('wallet_transactions', 'payroll_record_id', [(1450, 310), (1520, 310)], (1456, 296)),
            ('statements', 'company_id', [(225, 350), (225, 580)], (238, 480)),
            ('statement_items', 'statement_id', [(370, 620), (440, 620)], (389, 607)),
            ('statement_items', 'trip_payroll_record_id', [(1305, 350), (1305, 440), (585, 440), (585, 580)], (595, 465)),
            ('trip_assignments', 'trip_id', [(945, 350), (945, 500), (1305, 500), (1305, 580)], (1050, 486)),
            ('trip_assignments', 'driver_id', [(1090, 620), (1160, 620)], (1100, 607)),
            ('trip_reports', 'payroll_record_id', [(1350, 350), (1350, 405), (1665, 405), (1665, 580)], (1490, 391)),
            ('trip_expenses', 'trip_id', [(1090, 335), (1125, 335), (1125, 755), (1305, 755), (1305, 825)], (1030, 742)),
            ('statement_approvals', 'statement_id', [(225, 660), (225, 825)], (238, 761)),
        ]
        for child, column, points, label in routes:
            ref = next(r for r in self.refs if r.child == child and r.column == column)
            unique = self.tables[child].unique(column)
            c.setStrokeColor(TEAL)
            c.setLineWidth(1.5)
            path = c.beginPath()
            path.moveTo(points[0][0], H - points[0][1])
            for x, y in points[1:]:
                path.lineTo(x, H - y)
            c.drawPath(path)
            x, y = points[-1]
            px, py = points[-2]
            if x > px:
                c.line(x - 10, H - y + 5, x, H - y)
                c.line(x - 10, H - y - 5, x, H - y)
            else:
                c.line(x - 5, H - y + 10, x, H - y)
                c.line(x + 5, H - y + 10, x, H - y)
            text(c, *label, ref.id + (' 0..1' if unique else ' N'), 13, color=TEAL)
        for name, (x, top, subtitle) in nodes.items():
            c.setFillColor(PALE)
            c.setStrokeColor(LINE)
            c.roundRect(x, H - top - 80, 290, 80, 8, fill=1, stroke=1)
            text(c, x + 15, top + 28, name, 18, 'Body-Bold', NAVY)
            text(c, x + 15, top + 55, subtitle, 14, color=MUTED)
        text(c, 64, 965, 'Arrows: parent to child. Rxx refers to page 7; N/0..1 is children per parent. No parent is required to have a child. Crossings do not join.', 15, color=MUTED)
        text(c, 64, 990, 'Financial closure and applicable outbox intent commit together; email is sent after commit. Additional integrity rules live in the database guides.', 15, color=MUTED)
        self.end()

    def reference_page(self):
        self.start('Foreign-key reference inventory', 'Every declared Ref from hired.dbml, in source order. Unique child keys allow at most one child per parent; other children are many.')
        c = self.c
        headings = [(64, 'REF'), (150, 'CHILD / FOREIGN KEY'), (850, 'PARENT / REFERENCED KEY'), (1390, 'DBML'), (1485, 'CHILDREN / PARENT'), (1730, 'FK NULL?')]
        for x, title in headings:
            text(c, x, 180, title, 13, 'Body-Bold', MUTED)
        for index, ref in enumerate(self.refs):
            top = 195 + index * 14
            c.setFillColor(PALE if index % 2 == 0 else white)
            c.rect(64, H - top - 14, W - 128, 14, fill=1, stroke=0)
            values = [ref.id, f'{ref.child}.{ref.column}', f'{ref.parent}.{ref.target}', ref.operator,
                      '0..1' if self.tables[ref.child].unique(ref.column) else '0..N',
                      'No' if self.tables[ref.child].col(ref.column).required else 'Yes']
            for (x, _), value in zip(headings, values):
                text(c, x, top + 11, value, 12)
        assert 195 + len(self.refs) * 14 < 994, 'Split reference inventory before adding more references'
        self.end()

    def enum_page(self):
        self.start('Status enums and implementation boundaries', 'Exact enum types and values from hired.dbml. Extension states are preserved; their presence does not approve a Phase 1 workflow.')
        c = self.c
        assert len(self.enums) <= 16, 'Extend enum layout for additional enum types'
        for index, (name, values) in enumerate(self.enums.items()):
            assert len(values) <= 5, 'Extend enum card for additional values'
            col, row = index % 4, index // 4
            x, top, width = 64 + col * 456, 190 + row * 156, 424
            c.setFillColor(PALE)
            c.setStrokeColor(LINE)
            c.roundRect(x, H - top - 140, width, 140, 6, fill=1, stroke=1)
            text(c, x + 14, top + 28, name, 18, 'Body-Bold', NAVY)
            for j, value in enumerate(values):
                text(c, x + 14, top + 54 + j * 16, value, 15)
        notes = [
            'Integrity: CHECKs, partial uniqueness, immutable-record controls and lock ordering are specified in indexing-strategy.md and database-design.md; this PDF does not execute them.',
            'Estimate rows are highlighted in orders and trips. Rough distance/speed estimates, admin overrides and unavailable states remain distinct; policy calibration is still DEC-32.',
            'Optional scoring tables and reserved enum values remain design extensions. Durable HTTP replay, upload context and aggregate version mechanisms still need separate reviewed design.',
            'Prisma adoption does not add or rename tables here. PostgreSQL remains authoritative; report JSON structure is separately defined in trip-report-snapshot.schema.json.',
        ]
        y = 850
        for note in notes:
            for line in wrap(note, W - 128, 'Body', 15):
                text(c, 64, y, line, 15, color=MUTED)
                y += 20
        assert y <= 1000
        self.end()

    def build(self):
        groups = [
            ('Identity and company configuration', 'Accounts, private sessions, tenant membership and company payout-rate history.',
             [['users', 'auth_sessions'], ['companies', 'company_payout_rates'], ['company_users']]),
            ('Driver onboarding and secure assets', 'Operational activation is separate from availability. Scoring records remain optional design extensions.',
             [['drivers', 'driver_availability_dates'], ['file_assets', 'driver_documents'], ['driver_performance_summaries', 'driver_score_events']]),
            ('Orders, trips and dispatch', 'Green rows show the current estimate inputs, automatic source/evidence and admin override fields.',
             [['orders'], ['trips'], ['trip_assignments', 'trip_selfies']]),
            ('Expenses, reports, payroll and wallet', 'Successful closure persists payroll, report, credit and balance in one PostgreSQL transaction.',
             [['trip_expenses', 'wallet_accounts'], ['trip_reports', 'wallet_transactions'], ['trip_payroll_records']]),
            ('Statements, notification intents and audit', 'Frozen statement content, explicit approvals, transactional notification intents and sanitized audit history.',
             [['statements'], ['notifications'], ['statement_items', 'statement_approvals', 'audit_logs']]),
        ]
        names = [n for _, _, cols in groups for group in cols for n in group]
        assert len(names) == len(set(names)) and set(names) == set(self.tables), 'Update field-page layout for changed table inventory'
        self.overview()
        for args in groups:
            self.field_page(*args)
        self.reference_page()
        self.enum_page()
        self.c.save()
        self.verify()

    def verify(self):
        """Inspect the actual PDF text, not just the objects sent to the canvas."""
        reader = PdfReader(self.output)
        assert len(reader.pages) == 8
        texts = [page.extract_text() for page in reader.pages]
        for name, table in self.tables.items():
            page, *_ = self.rects[name]
            content = texts[page - 1]
            start = content.index('\n' + name + '\n')
            later = [content.find('\n' + other + '\n', start + len(name) + 2) for other, (p, *_) in self.rects.items() if p == page and other != name]
            stop = min([i for i in later if i >= 0], default=len(content))
            block = content[start:stop]
            for column in table.columns:
                flags = []
                if table.pk(column.name):
                    flags.append('PK')
                elif column.has('unique'):
                    flags.append('UQ')
                flags.append('NN' if column.required else 'NULL')
                flags.extend('FK ' + r.id for r in self.refs if r.child == name and r.column == column.name)
                expected = '\n' + column.name + '\n' + column.dtype + '\n' + ' '.join(flags) + '\n'
                assert expected in block, (name, column.name, column.dtype, flags)
            for line in self.metadata(table):
                for part in wrap(line, 552, 'Body', 12):
                    assert part in block, (name, part)
        inventory = texts[6]
        for ref in self.refs:
            children = '0..1' if self.tables[ref.child].unique(ref.column) else '0..N'
            nullable = 'No' if self.tables[ref.child].col(ref.column).required else 'Yes'
            expected = f'{ref.id}\n{ref.child}.{ref.column}\n{ref.parent}.{ref.target}\n{ref.operator}\n{children}\n{nullable}\n'
            assert expected in inventory, ref
        for name, values in self.enums.items():
            assert '\n' + name + '\n' in texts[7]
            assert all('\n' + value + '\n' in texts[7] for value in values)
        for table in ['orders', 'trips']:
            assert ESTIMATE_FIELDS <= {c.name for c in self.tables[table].columns}
        assert hashlib.sha256(self.source.read_bytes()).hexdigest() == self.sha, 'Source changed during generation'
        print(json.dumps({'source': str(self.source), 'source_sha256': self.sha,
                          'tables': len(self.tables), 'columns': sum(len(t.columns) for t in self.tables.values()),
                          'relationships': len(self.refs), 'enums': len(self.enums), 'pages': len(reader.pages),
                          'output': str(self.output), 'text_coverage': 'passed', 'layout_bounds': 'passed'}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True, help='Design export date, YYYY-MM-DD (not a schema approval)')
    parser.add_argument('--source', type=Path, default=ROOT / 'hired.dbml')
    parser.add_argument('--output', type=Path, default=ROOT / 'HireD_Phase_1_Database_ERD.pdf')
    args = parser.parse_args()
    datetime.strptime(args.date, '%Y-%m-%d')
    Export(args.source.resolve(), args.output.resolve(), args.date).build()


if __name__ == '__main__':
    main()
