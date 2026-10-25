"""Build the car spec + part number list from the Job Tracker sheet.

Every car we have worked on becomes one vehicle_specs row (year, make, model, engine) with what we used:
oil grade, litres, oil filter, cabin filter, engine air filter and wiper blades. Rows that hold two cars
("2015 Corolla ... -- 2024 RAV4 ...") are split. The newest job wins when two jobs disagree.

  python3 scripts/specs_from_tracker.py Finance_Tracker.xlsx supabase/migrations/0026_specs_and_parts_from_sheet.sql
"""
import openpyxl, re, sys, datetime as dt

MAKES = {'nissan': 'Nissan', 'nissans': 'Nissan', 'hyundai': 'Hyundai', 'hyuandai': 'Hyundai', 'honda': 'Honda', 'toyota': 'Toyota',
         'chevy': 'Chevrolet', 'chevrolet': 'Chevrolet', 'gmc': 'GMC', 'jeep': 'Jeep', 'ford': 'Ford', 'mazda': 'Mazda', 'subaru': 'Subaru',
         'kia': 'Kia', 'vw': 'Volkswagen', 'volkswagen': 'Volkswagen', 'bmw': 'BMW', 'mercedes': 'Mercedes-Benz', 'mitsubishi': 'Mitsubishi',
         'mistubishi': 'Mitsubishi', 'mitsubish': 'Mitsubishi', 'chrysler': 'Chrysler', 'dodge': 'Dodge', 'scion': 'Scion', 'acura': 'Acura', 'ram': 'Ram'}
MODEL_MAKE = {'elantra': 'Hyundai', 'cruze': 'Chevrolet', 'civic': 'Honda', 'corolla': 'Toyota', 'rav4': 'Toyota'}
# model words as written in the sheet -> the name the booking form uses
MODELS = [  # (regex on the text after the make, model name)
    (r'sierra', 'Sierra 1500'), (r'f-?150', 'F-150'), (r'grand cherokee', 'Grand Cherokee'), (r'cherokee', 'Cherokee'), (r'grand highlander', 'Grand Highlander'), (r'highlander', 'Highlander'),
    (r'eclipse cross', 'Eclipse Cross'), (r'outlander sport|rvr', 'RVR'), (r'outlander', 'Outlander'), (r'lancer', 'Lancer'),
    (r'genesis coupe', 'Genesis Coupe'), (r'santa fe', 'Santa Fe'), (r'tucson', 'Tucson'), (r'sonata', 'Sonata'), (r'elantra', 'Elantra'),
    (r'accent', 'Accent'), (r'kona', 'Kona'), (r'venue', 'Venue'), (r'sentra', 'Sentra'), (r'kicks', 'Kicks'), (r'altima', 'Altima'),
    (r'maxima', 'Maxima'), (r'rogue', 'Rogue'), (r'pathfinder', 'Pathfinder'), (r'qashq\w*', 'Qashqai'), (r'terrain', 'Terrain'),
    (r'cruz\w*|cruse', 'Cruze'), (r'malibu', 'Malibu'), (r'trax', 'Trax'), (r'equinox', 'Equinox'),
    (r'orlando', 'Orlando'), (r'camry', 'Camry'), (r'corolla', 'Corolla'), (r'rav4', 'RAV4'), (r'4runner', '4Runner'), (r'tundra', 'Tundra'),
    (r'civic', 'Civic'), (r'accord', 'Accord'), (r'cr-?v', 'CR-V'), (r'pilot', 'Pilot'), (r'ilx', 'ILX'), (r'forest\w*', 'Forester'),
    (r'outback', 'Outback'), (r'impreza', 'Impreza'), (r'tiguan', 'Tiguan'), (r'atlas|altas', 'Atlas'), (r'cx-?30', 'CX-30'),
    (r'mazda\s*6|(?<![\d.])6(?![\d.])', 'Mazda6'), (r'mazda\s*3|(?<![\d.])3(?![\d.])', 'Mazda3'), (r'x3', 'X3'), (r'c\s*300', 'C-Class'), (r'sorento', 'Sorento'),
    (r'soul', 'Soul'), (r'rio', 'Rio'), (r'\bim\b', 'iM'), (r'1500', '1500'), (r'escape', 'Escape'), (r'fusion', 'Fusion'),
    (r'journey', 'Journey'), (r'\b200\b', '200'), (r'taurus', 'Taurus'),
]
# engines the sheet leaves out but the car only came with one of (or the note says it another way)
ENGINE_FIX = {('Mercedes-Benz', 'C-Class', 2010): '3.0L', ('Honda', 'Civic', 2019, 3.5): '1.5L', ('Hyundai', 'Venue', 2024): '1.6L',
              ('Hyundai', 'Santa Fe', 2024): '2.5L', ('GMC', 'Sierra 1500', 2015): '5.3L', ('Mitsubishi', 'Lancer', 2014): '2.4L',
              ('Ford', 'Fusion', 2014): '2.5L', ('Honda', 'Civic', 2013): '1.8L', ('Kia', 'Rio', 2018): '1.6L'}

def year_of(s):
    m = re.search(r'\b(19[89]\d|20[0-3]\d)\b', s)
    return int(m.group(1)) if m else None

def split_cars(t):
    """One cell can describe two cars: split before a second 'YYYY make' (or at ' -- ')."""
    s = ' '.join(str(t).split())
    parts = re.split(r'\s+--\s+', s)
    out = []
    for p in parts:
        idx = [m.start() for m in re.finditer(r'(?<![\d.])(?:19[89]\d|20[0-3]\d)\s+[A-Za-z]', p)]
        idx = [i for i in idx if i == 0 or re.search(r'\)\s*$', p[:i])] or idx[:1]
        if len(idx) > 1:
            for a, b in zip([0] + idx[1:], idx[1:] + [len(p)]): out.append(p[a:b].strip())
        else: out.append(p)
    return [x for x in out if x]

def parse_car(s):
    low = s.lower()
    d = {'year': year_of(s), 'make': None, 'model': None, 'engine': None, 'grade': None, 'cap': None,
         'oil_filter': None, 'cabin': None, 'air': None, 'wiper_d': None, 'wiper_p': None, 'spec': None}
    words = re.findall(r"[a-z0-9\-]+", low)
    make_at = next((i for i, w in enumerate(words) if w in MAKES), None)
    if make_at is None:
        hit = next((w for w in words if w in MODEL_MAKE), None)
        if hit: d['make'] = MODEL_MAKE[hit]; after = low
        else: return d
    else:
        d['make'] = MAKES[words[make_at]]
        after = low[re.search(r'\b' + re.escape(words[make_at]) + r'\b', low).end():]
    head = re.split(r'\(|\boil\b|\bcabin\b|\bengine (?:type|filter)\b|\d{1,2}\s*w\s*[-_]?\s*\d', after)[0]
    for rx, name in MODELS:
        if name in ('Mazda6', 'Mazda3') and d['make'] != 'Mazda': continue
        if re.search(rx, head): d['model'] = name; break
    if d['make'] == 'Ram' and d['model'] is None: d['model'] = '1500'
    # engine size: in the name part, or "(engine -2.5l)", or "(2.0 L)"
    m = re.search(r'\b(\d\.\d|\d)\s*(?:l|litre|liter)\b', head) or re.search(r'\b(\d\.\d)\b', head) \
        or re.search(r'engine\s*-\s*(\d\.\d)\s*l', low) or re.search(r'^[^(]*\((\d(?:\.\d)?)\s*l(?:itre|iter)?\b', after)
    if m and float(m.group(1)) <= 6.8: d['engine'] = f"{float(m.group(1)):.1f}L"
    if d['engine'] and re.search(r'(?<!non )(?<!non-)hybrid', low): d['engine'] += ' Hybrid'
    g = re.search(r'\b(\d{1,2})\s*w\s*[-_]?\s*(\d{1,2})\b', low)
    if g:
        d['grade'] = f"{g.group(1)}W-{g.group(2)}"
        if 'euro' in low[g.start():g.start() + 40] or 'vw50' in low.replace(' ', '') or '229' in low: d['grade'] = 'Euro ' + d['grade']
        c = re.search(r'(\d{1,2}(?:\.\d)?)\s*l\b', low[g.end():g.end() + 40])
    else: c = None
    c = c or re.search(r'capacity\s*-?\s*[-:]?\s*(\d{1,2}(?:\.\d)?)\s*l', low)
    if c and 2.5 <= float(c.group(1)) <= 9: d['cap'] = float(c.group(1))
    num = lambda rx: (lambda m: m.group(1) if m else None)(re.search(rx, low))
    d['oil_filter'] = num(r'(?<!cabin )(?<!engine )(?<!air )filter(?:\s*type)?\s*[-–:]*\s*(\d{4,7})')
    d['cabin'] = num(r'cabin(?: air)? filter\s*[-–:]*\s*(\d{4,8})')
    d['air'] = num(r'engine(?: air)? filter\s*[-–:]*\s*(\d{4,8})')
    d['wiper_d'] = num(r'driver(?:s)? wiper\s*[-–:]*\s*(\d{4,8})')
    d['wiper_p'] = num(r'pass(?:enger)? wiper\s*[-–:]*\s*(\d{4,8})')
    # the approval the oil has to meet, when the note says it (VW 502 00, MB 229.5, dexos1)
    specs = [f"VW {m.group(1)} {m.group(2) or '00'}" for m in re.finditer(r'vw\s*(5\d\d)\s*(\d\d)?', low)]
    specs += [f"MB {m.group(1)}" for m in re.finditer(r'mb\s*(229\.\d+)', low)]
    specs += [m.group(0).replace('dexos', 'dexos') for m in re.finditer(r'dexos\s*\d(?:\s*gen\s*\d)?', low)]
    d['spec'] = ' / '.join(dict.fromkeys(specs)) or None
    key = (d['make'], d['model'], d['year'])
    if not d['engine']:
        d['engine'] = ENGINE_FIX.get(key + (d['cap'],)) or ENGINE_FIX.get(key)
    return d

def q(v):
    if v is None or v == '': return 'null'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"

def main(src, out):
    ws = openpyxl.load_workbook(src, data_only=True)['Job Tracker']
    cars = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        date, text, service = r[0], r[2], str(r[3] or '')
        if not date or not text or re.search(r'cancel', service, re.I): continue
        day = date.date() if hasattr(date, 'date') else dt.date.fromisoformat(str(date)[:10])
        for s in split_cars(text):
            d = parse_car(s)
            if not (d['year'] and d['make'] and d['model']): continue
            if not any(d[k] for k in ('grade', 'oil_filter', 'cabin', 'air', 'wiper_d')): continue
            k = (d['year'], d['make'], d['model'], (d['engine'] or '').lower())
            c = cars.setdefault(k, {'times': 0, 'last': day, **{x: None for x in d}})
            c['times'] += 1
            newer = day >= c['last']
            for f, v in d.items():
                if v is not None and (c[f] is None or newer): c[f] = v
            c['last'] = max(c['last'], day)
    rows = sorted(cars.values(), key=lambda c: (c['make'], c['model'], c['year'], c['engine'] or ''))
    vals = ',\n'.join(
        f"({c['year']},{q(c['make'])},{q(c['model'])},{q(c['engine'])},{q(c['grade'])},{q(c['cap'])},{q(c['oil_filter'])},{q(c['cabin'])},"
        f"{q(c['air'])},{q(c['wiper_d'])},{q(c['wiper_p'])},{q(c['spec'])},{c['times']},'{c['last']}')" for c in rows)
    parts = sorted({(c[f], b, desc, cat) for c in rows for f, b, desc, cat in (
        ('oil_filter', 'NAPA ProFormer', 'Oil filter', 'oil_filter'), ('cabin', 'NAPA', 'Cabin air filter', 'cabin_filter'),
        ('air', 'NAPA', 'Engine air filter', 'engine_filter'), ('wiper_d', 'NAPA', 'Wiper blade (driver)', 'wiper'),
        ('wiper_p', 'NAPA', 'Wiper blade (passenger)', 'wiper')) if c[f]})
    pvals = ',\n'.join(f"({q(p)},{q(b)},{q(desc)},{q(cat)})" for p, b, desc, cat in parts)
    sql = f"""-- OCOTS OS: every car we have serviced, with the oil and part numbers we used (from the Job Tracker sheet).
-- Generated by scripts/specs_from_tracker.py. Safe to run again: it replaces the sheet rows and keeps online lookups.
begin;

alter table vehicle_specs add column if not exists cabin_filter_part text;
alter table vehicle_specs add column if not exists air_filter_part text;
alter table vehicle_specs add column if not exists wiper_driver text;
alter table vehicle_specs add column if not exists wiper_passenger text;
alter table vehicle_specs add column if not exists filter_note text;
-- a car we only did filters or wipers on still keeps its part numbers
alter table vehicle_specs alter column oil_grade drop not null;
alter table vehicle_specs alter column capacity_l drop not null;

create temp table sheet_specs (year int, make text, model text, engine text, oil_grade text, capacity_l numeric, oil_filter text,
  cabin text, air text, wiper_d text, wiper_p text, oil_spec text, times int, last_done date) on commit drop;
insert into sheet_specs values
{vals};

-- replace the older history rows (0003) and any earlier copy of this list
update vehicles set spec_id = null where spec_id in (select id from vehicle_specs where source in ('job_history','sheet'));
delete from vehicle_specs where source in ('job_history','sheet');
insert into vehicle_specs (year_from, year_to, make, model, engine, fuel, oil_grade, capacity_l, oil_filter_part, cabin_filter_part, air_filter_part,
  wiper_driver, wiper_passenger, oil_spec, source, verified, times_done, last_done)
select year, year, make, model, engine, case when engine ilike '%hybrid%' then 'hybrid' else 'gas' end, oil_grade, capacity_l, oil_filter, cabin, air,
  wiper_d, wiper_p, oil_spec, 'sheet', true, times, last_done
from sheet_specs;

-- online lookups for a car we have now done ourselves: ours wins
delete from vehicle_specs a using vehicle_specs s
where a.source = 'ai_lookup' and s.source = 'sheet' and a.year_from = s.year_from and lower(a.make) = lower(s.make) and lower(a.model) = lower(s.model)
  and a.id not in (select spec_id from vehicles where spec_id is not null);

-- the first import missed one model name
update vehicles set model = 'Terrain' where make = 'GMC' and model is null and year = 2019;

-- link customers' cars to their spec. Names are compared the way the app does ("Mazda6" = "6", "C300" = "C-Class", "Sierra" = "Sierra 1500").
create or replace function car_model_key(make text, model text) returns text language sql immutable as $$
  select case k when 'rvr' then 'outlandersport' when 'qashqai' then 'roguesport' else k end from (
    select case when mk = 'mercedesbenz' then regexp_replace(regexp_replace(k0, '^([a-z]{{1,3}})[0-9]{{2,3}}[a-z0-9]*$', '\\1class'), '^([a-z]{{1,3}})class.*$', '\\1class')
                else k0 end as k
    from (select case when mk <> '' and left(m, length(mk)) = mk and length(m) > length(mk) then substr(m, length(mk) + 1) else m end as k0, mk
          from (select regexp_replace(lower(coalesce(model,'')), '[^a-z0-9]', '', 'g') as m,
                       case regexp_replace(lower(coalesce(make,'')), '[^a-z0-9]', '', 'g') when 'chevy' then 'chevrolet' when 'mercedes' then 'mercedesbenz'
                         when 'vw' then 'volkswagen' else regexp_replace(lower(coalesce(make,'')), '[^a-z0-9]', '', 'g') end as mk) a) b) c
$$;
create or replace function car_make_key(make text) returns text language sql immutable as $$
  select case k when 'chevy' then 'chevrolet' when 'mercedes' then 'mercedesbenz' when 'vw' then 'volkswagen' else k end
  from (select regexp_replace(lower(coalesce(make,'')), '[^a-z0-9]', '', 'g') as k) a
$$;

update vehicles v set spec_id = (
  select s.id from vehicle_specs s
  where s.source = 'sheet' and s.year_from = v.year and car_make_key(s.make) = car_make_key(v.make)
    and (car_model_key(s.make, s.model) = car_model_key(v.make, v.model)
         or (length(car_model_key(v.make, v.model)) >= 3 and car_model_key(s.make, s.model) like car_model_key(v.make, v.model) || '%')
         or (length(car_model_key(s.make, s.model)) >= 3 and car_model_key(v.make, v.model) like car_model_key(s.make, s.model) || '%'))
  order by (car_model_key(s.make, s.model) = car_model_key(v.make, v.model)) desc,
    (coalesce(s.engine,'') <> '' and coalesce(v.engine,'') <> '' and left(s.engine,3) = left(v.engine,3)) desc, s.oil_grade is not null desc, s.times_done desc
  limit 1)
where v.spec_id is null and v.year is not null and v.make is not null and v.model is not null;

-- every part number we have used, so stock and the order list know them
insert into parts (part_number, brand, description, category) values
{pvals}
on conflict (part_number, brand) do nothing;

commit;

select (select count(*) from vehicle_specs where source = 'sheet') as cars,
       (select count(*) from vehicle_specs where source = 'sheet' and oil_filter_part is not null) as with_oil_filter,
       (select count(*) from vehicles where spec_id is not null) as customer_cars_linked;
"""
    open(out, 'w').write(sql)
    for c in rows:
        print(c['year'], c['make'], c['model'], c['engine'], c['grade'], c['cap'], c['oil_filter'], c['cabin'], c['air'], c['wiper_d'], c['wiper_p'], c['spec'], c['times'], file=sys.stderr)
    print(len(rows), 'cars,', len(parts), 'parts', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
