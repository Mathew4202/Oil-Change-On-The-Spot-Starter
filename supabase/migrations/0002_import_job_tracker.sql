-- OCOTS OS: import Job Tracker + Expense Tracker history (safe to run again)
begin;
create extension if not exists pg_trgm;
alter table jobs add column if not exists customer_id uuid references customers(id);
alter table jobs add column if not exists service text;
alter table jobs add column if not exists payment_method text;
alter table jobs add column if not exists split text;
alter table jobs add column if not exists notes text;
alter table jobs add column if not exists filter_part text;
alter table jobs add column if not exists vehicle_text text;
alter table expenses add column if not exists description text;
alter table jobs add column if not exists hst numeric(10,2);
alter table jobs add column if not exists tip numeric(10,2);          -- tips: income, but no HST on them
alter table expenses add column if not exists source text;
alter table customers add column if not exists source text;
alter table vehicles add column if not exists source text;

-- clear an earlier run of this import
delete from jobs where imported_from = 'job_tracker';
delete from vehicles where source = 'job_tracker' and id not in (select vehicle_id from jobs where vehicle_id is not null);
delete from expenses where source in ('expense_tracker', 'job_tracker_costs');

create temp table jt (n int, d date, name text, raw text, service text, price numeric, oil numeric, filt numeric, other numeric,
  notes text, method text, split text, yr int, make text, model text, engine text, grade text, cap numeric, filter text, hst numeric, tip numeric,
  customer_id uuid, score real, vehicle_id uuid) on commit drop;
insert into jt (n,d,name,raw,service,price,oil,filt,other,notes,method,split,yr,make,model,engine,grade,cap,filter,hst,tip) values
(1,'2026-05-15','Johnson','2010 Nissan Sentra 2.0L (5w-30 3.9l oil) filter - 21358','Oil Change',90.0,21.14,6.45,12.88,null,'etransfer','Both',2010.0,'Nissan','Sentra','2.0L','5W-30',3.9,'21358',12.6,0.0),
(2,'2026-05-19','jashanpreey Kaur','2014 elantra 1.8 l (5w-30 or 5w-20 4l oil) filter - 21334','Oil Change',70.0,1.08,6.45,12.88,null,'etransfer','Both',2014.0,'Hyundai','Elantra','1.8L','5W-30',4.0,'21334',9.8,0.0),
(3,'2026-05-18','Lucy Katuutu','Elantra','Tire Change',100.0,null,null,null,null,'etransfer','Mathew',null,'Hyundai','Elantra',null,null,null,null,0.0,0.0),
(4,'2026-05-19','Georgina Devoe','2018 Nissan kicks 1.6L (0w-20 4.1l oil) filter - 21358','Oil Change',110.0,22.22,6.45,12.88,null,'etransfer','Both',2018.0,'Nissan','Kicks','1.6L','0W-20',4.1,'21358',15.4,0.0),
(5,'2026-05-20','Lisa Megeney','2019 GMC Terrain (1.5 litre turbo) • XLE (0W-20 4l oil) filter - 2100290','Oil Change',124.6,25.64,6.4,12.88,null,'etransfer','Both',2019.0,'GMC',null,null,'0W-20',4.0,'2100290',15.4,14.6),
(6,'2026-05-20','Trina Lyonnais','2019 Honda Crv','Tire Change',90.4,null,null,12.88,null,'cash','Both',2019.0,'Honda','CR-V',null,null,null,null,12.6,0.4),
(7,'2026-05-26','Riaz Chowdhury','Toyota highlander','Oil Change, cabin air filter, engine air filter',90.88,null,null,12.5,null,null,'both',null,'Toyota','Highlander',null,null,null,null,11.32,0.0),
(8,'2026-05-21','cody hall','2015 jeep grand cherokee v8 5.7, (oil and capacity - 5w-20, 6.6L) filter - 27899','Oil Change',114.6,35.77,6.66,26.33,null,'cash','both',2015.0,'Jeep','Grand Cherokee','5.7L','5W-20',6.6,'27899',15.4,4.6),
(9,'2026-05-22','cody hall','2020 jeep Cherokee trailhawk 3.2l v6 (oil type - 5w20, oil capacity - 5.6L) filter - 2100010','Oil Change',114.6,30.35,8.85,12.5,null,'cash','both',2020.0,'Jeep','Cherokee Trailhawk','3.2L','5W-20',5.6,'2100010',15.4,4.6),
(10,'2026-05-24','mike','2012 chevy cruze 1.4L turbo,( oil type -5w30 capacity - 4L ) filter - 27674','Oil Change',88.08,36.51,8.85,12.5,'5 bucks off due to him referring his son cash','cash','both',2012.0,'Chevrolet','Cruze','1.4L','5W-30',4.0,'27674',11.92,2.91),
(11,'2026-05-24','Salad Kahn','2019 Chevy Cruze','Oil Change',54.74,null,null,12.5,null,'etransfer','both',2019.0,'Chevrolet','Cruze',null,null,null,null,7.66,0.0),
(12,'2026-05-27','Malkeet Singh','2022 Toyota Camry 2.5l oil type and capacity 0w-16 4.5L filter - 2100332','Oil Change',110.0,45.59,9.56,12.5,null,'etransfer','both',2022.0,'Toyota','Camry','2.5L','0W-16',4.5,'2100332',15.4,0.0),
(13,'2026-06-02','Sukhdev Gill','2012 Cruze eco 1.4 l (oil type and capacity 5w-30 4L) filter - 27674','Oil Change',80.0,22.16,9.79,8.0,null,'etransfer','both',2012.0,'Chevrolet','Cruze','1.4L','5W-30',4.0,'27674',11.2,0.0),
(14,'2026-06-05','Mark Aymar','2013 Cruze lt 1.4 l (oil type and capacity 5w-30 4L) filter - 27674','Oil Change coolant fluid',120.0,23.36,6.94,35.13,null,'etransfer','both',2013.0,'Chevrolet','Cruze','1.4L','5W-30',4.0,'27674',16.8,0.0),
(15,'2026-06-06','Heather Mackinnon','2017 subaru foresta 2.5l (oil type and capacity 0w-20 4.8L) filter - 27055','Oil Change',114.6,26.59,5.4,12.5,null,'etransfer','both',2017.0,'Subaru','Forester','2.5L','0W-20',4.8,'27055',15.4,0.0),
(16,'2026-06-11','Morgan MacKinnon','2025 Honda Crv 2.0 l hybrid (oil type and capacity 0w-20 4.3l) filter - 27356','Oil Change',110.0,28.81,5.12,12.84,null,'etransfer','both',2025.0,'Honda','CR-V','2.0L','0W-20',4.3,'27356',15.4,0.0),
(17,'2026-06-07','nihar shah','2017 chevy cruse ( lost of power battery would hold and overheating)','Road side assistance',100.0,0.0,0.0,9.09,null,'etransfer','both',2017.0,'Chevrolet','Cruze',null,null,null,null,14.0,0.0),
(18,'2026-06-11','Chris Murray','2018 ford f150 3.5l ecoboost (oil type - 5w-30) ( oil capacity- 5.7L) (filter- forgot 😆)','Oil Change',130.0,31.58,0.0,9.09,null,'etransfer','both',2018.0,'Ford','F-150','3.5L','5W-30',5.7,null,18.2,0.0),
(19,'2026-06-11','Rod Smith','2024 hyundai elantra 2L (oil capacity - 4.5L) (oil type 0w-20) (oil filter- 2100521)','Oil Change',107.4,26.19,12.28,9.09,null,'cash','both',2024.0,'Hyundai','Elantra','2.0L','0W-20',4.5,'2100521',12.6,17.4),
(20,'2026-06-12','Shahbaz Saiyed','2015 vw Tiguan 2.0l (oil type and capacity - 5w-40 euro vw502 00 4.7 l) oil filter - 27561 cabin filter - 224489 engine filter - 29020','Oil Change cabin filter engine filter',160.0,45.59,9.1,54.67,null,'etransfer','both',2015.0,'Volkswagen','Tiguan','2.0L','Euro 5W-40',4.7,'27561',22.4,0.0),
(21,'2026-06-12','Susan Andrecyk','2021 Mazda cx-30 2.5l (oil type 0w-20 capacity 4.5l ) oil filter - 27002','Oil Change',110.0,26.19,5.26,9.09,null,'etransfer','both',2021.0,'Mazda','CX-30','2.5L','0W-20',4.5,'27002',15.4,0.0),
(22,'2026-06-13','Ricky Chisholm','2015 toyota Corolla 1.5l (oil type 0w-20) ( oil capacity 4.2L) (filter type - 27064) -- 2024 rav4 2.5l non hybrid (oil type 0w-16) (oil capacity -4.3L (filter type - 2100332)','Oil Change',200.0,47.09,11.83,9.09,null,'etransfer','both',2015.0,'Toyota','Corolla','1.5L','0W-20',4.2,'27064',28.0,0.0),
(23,'2026-06-17','Veronica','2021 bmw x3 hybrid 2.0l(oil type and capacity 0w-20 5.6l) (filter - 2100358)','Oil Change',180.0,79.98,12.83,9.09,null,null,'Both',2021.0,'BMW','X3','2.0L','0W-20',5.6,'2100358',25.2,0.0),
(24,'2026-06-17','Justin Townsend','2019 Honda civic (oil type and capacity, 0w-20 3.5 l) filter - 27356','Oil Change',90.0,20.5,5.12,9.09,null,null,'both',2019.0,'Honda','Civic',null,'0W-20',3.5,'27356',12.6,0.0),
(25,'2026-06-17','Mayank Gera','2020 toyota corolla se 2.0L (oil type - 0w16) (oil capacity - 4.2L) filter - 2100332','Oil Change',60.0,0.0,6.77,9.09,null,null,'both',2020.0,'Toyota','Corolla','2.0L','0W-16',4.2,'2100332',8.4,0.0),
(26,'2026-06-22','Nicole Bennett','2024 hyuandai venue (oil type and capacity 0w-20 3.8l) filter - 2100473','Oil Change',114.6,21.05,14.07,9.09,null,null,'both',2024.0,'Hyundai','Venue',null,'0W-20',3.8,'2100473',15.4,4.6),
(27,'2026-06-26','Omar','2012 Toyota Camry 2.5l hybrid (oil type and capacity 0w-20 4.3l ) filter - 27047','Oil Change',90.0,23.22,5.37,null,null,null,'both',2012.0,'Toyota','Camry','2.5L','0W-20',4.3,'27047',12.6,0.0),
(28,'2026-06-26','Quamari Downey','2013 Nissan maxima 3.5l (oil type and capacity 5w-30 4.8l) filter - 21358','Oil Change',90.0,25.92,5.12,null,null,null,'both',2013.0,'Nissan','Maxima','3.5L','5W-30',4.8,'21358',12.6,0.0),
(29,'2026-06-27','Thomson Benny','2019 Honda accord 1.5l (oil capacity 0w-20 3.5l) filter - 27356','Oil Change',90.0,18.9,5.12,null,null,null,'both',2019.0,'Honda','Accord','1.5L','0W-20',3.5,'27356',12.6,0.0),
(30,'2026-06-28','Nathaniel','2012 Mitsubishi outlander 3.0l (oil capacity 5w-20 4.3l) filter - 27356','Oil Change',120.0,28.82,5.12,null,null,null,'both',2012.0,'Mitsubishi','Outlander','3.0L','5W-20',4.3,'27356',16.8,0.0),
(31,'2026-06-28','Amaan Mohammad','Nissans Altima 2013 SV 2.5L 4 cylinder(oil type and capacity 0w-20 4.6L) filter - 21358','Oil Change',90.0,25.48,5.12,null,null,null,'both',2013.0,'Nissan','Altima','2.5L','0W-20',4.6,'21358',12.6,0.0),
(32,'2026-07-02','Victor Amani','2012 Chrysler 200 lx, 2.4l I4 DOHC 16V ENGINE','Serpentine Belt',170.0,0.0,0.0,52.53,null,null,'both',2012.0,'Chrysler','200','2.4L',null,null,null,23.8,0.0),
(33,'2026-07-02','Dorothy thompson','2021 nissan rogue sv awd (engine -2.5l) (oil type - 0w20 and capacity 5.1l) filter - 21358','Oil Change',110.0,null,5.12,null,null,null,'both',2021.0,'Nissan','Rogue','2.5L','0W-20',5.1,'21358',15.4,0.0),
(34,'2026-07-03','Harshdeep','2021 Toyota Corolla le 1.8l 0w-20 4.6L filter - 21394','Oil Change',80.0,null,5.12,null,null,null,'both',2021.0,'Toyota','Corolla','1.8L','0W-20',4.6,'21394',11.2,0.0),
(35,'2026-07-07','Andrew Leblanc','2020 Hyundai Kona (2.0 L) • Essential (oil type - 5w20 and capacity 4l) filter - 21334','Oil Change',110.0,null,5.12,null,null,null,'mathew-70/harsh-30',2020.0,'Hyundai','Kona',null,'5W-20',4.0,'21334',15.4,0.0),
(36,'2026-07-10','Jeff bower','2015 Mazda 6 (2.5L) (oil type - 0w20 and capacity 4.5l) filter - 27002','Oil Change',100.0,null,5.27,null,null,null,'mathew-70/harsh-30',2015.0,'Mazda','6',null,'0W-20',4.5,'27002',12.6,10.0),
(37,'2026-07-10','Shari Euloth','2018 Nissan Qashqui (2 L) (oil type - 5w-30) and capacity 4 l) filter - 21358','Oil Change',110.0,null,5.12,null,null,null,'mathew-70/harsh-30',2018.0,'Nissan','Qashqai',null,'5W-30',4.0,'21358',15.4,0.0),
(38,'2026-07-12','Connor','2022 Mitsubishi Eclipse Cross 1.5l (oil type - 0w20) and capacity 4.3 l) filter - 27356','Oil Change',110.0,null,5.12,null,null,null,'mathew-70/harsh-30',2022.0,'Mitsubishi','Eclipse Cross','1.5L','0W-20',4.3,'27356',15.4,0.0),
(39,'2026-07-15','Clement will','2018 Kia Rio (1.6L 4cyl) • EX (oil type - 5w20) and capacity 3.6 l) filter - 21334 driver wiper - 602644 pass wiper - 601644','Oil Change, wiper blades',125.0,null,5.12,19.81,null,null,'mathew-70/harsh-30',2018.0,'Kia','Rio',null,'5W-20',3.6,'21334',17.5,0.0),
(40,'2026-07-15','Paramveer Singh','2025 hyuandai sonata 2.5l (oil type and capacity 0w20 5.6L) filter - 2100514','Oil Change',61.6,null,null,null,null,null,'mathew-70/harsh-30',2025.0,'Hyundai','Sonata','2.5L','0W-20',5.6,'2100514',8.4,1.6),
(41,'2026-07-16','Vantez Beals','2006 Honda civic 1.8l (oil type and capacity 5w20 3.7L) filter - 27356','Oil Change',107.4,37.79,5.12,null,null,null,'mathew-70/harsh-30',2006.0,'Honda','Civic','1.8L','5W-20',3.7,'27356',12.6,17.4),
(42,'2026-07-18','Andrew bellantyne','2021 nissan rogue platinum (engine -2.5l) (oil type - 0w20 and capacity 5.1l) filter - 21358','Oil Change',110.0,null,5.12,null,null,null,'mathew-70/harsh-30',2021.0,'Nissan','Rogue','2.5L','0W-20',5.1,'21358',15.4,0.0),
(43,'2026-07-21','Glenn Sabordo','2019 nissan rogue (engine -2.5l) (oil type - 0w20 and capacity 4.6l) filter - 21358','Oil Change',110.0,null,5.12,null,null,null,'mathew-70/harsh-30',2019.0,'Nissan','Rogue','2.5L','0W-20',4.6,'21358',15.4,0.0),
(44,'2026-07-23','Joe babichan','2023 mistubishi eclipse cross 1.5l (engine type and capacity 0w-20 4.3l) filter - 27356','Oil Change',114.6,null,5.12,null,null,null,'mathew-70/harsh-30',2023.0,'Mitsubishi','Eclipse Cross','1.5L','0W-20',4.3,'27356',15.4,4.6),
(45,'2026-07-24','Clarence','2018 Chevy Malibu my 1.5l (engine type and capacity 0w-20 4l) filter - 2100290','Oil Change',90.0,null,5.06,null,null,null,'mathew-70/harsh-30',2018.0,'Chevrolet','Malibu','1.5L','0W-20',4.0,'2100290',12.6,0.0),
(46,'2026-07-24','Chieo Nhema','2017 Chevy Cruze lt 1.4l (engine type and capacity 5w-30 4l) filter - 2100290','Oil Change',85.1,null,5.06,null,null,null,'mathew-70/harsh-30',2017.0,'Chevrolet','Cruze','1.4L','5W-30',4.0,'2100290',11.9,0.1),
(47,'2026-07-26','Denis power','2016 kia Sorento v6 3.3l (engine type and capacity 5w-30 5.7l) filter - 2100164','Oil Change',114.6,null,8.25,null,null,null,'mathew-70/harsh-30',2016.0,'Kia','Sorento','3.3L','5W-30',5.7,'2100164',15.4,4.6),
(48,'2026-07-26','Karan','2020 Toyota Corolla 1.8l (engine type and capacity 0w-20 4.2l) filter - 21394','Oil Change',90.0,null,5.12,null,null,null,'mathew-70/harsh-30',2020.0,'Toyota','Corolla','1.8L','0W-20',4.2,'21394',12.6,0.0),
(49,'2026-07-27','Danny','Chevy Taurus','Diagnostics',70.17,null,null,null,null,null,'mathew-70/harsh-30',null,'Chevrolet','Taurus',null,null,null,null,9.8,0.17),
(50,'2026-07-28','Erin costelo','2020 Kia soul 2.0l (engine type and capacity 5w-20 4.0l) filter - 21334 cabin filter - 2230265','Oil change cabin air filter',145.0,null,5.12,21.65,null,null,'mathew-70/harsh-30',2020.0,'Kia','Soul','2.0L','5W-20',4.0,'21334',20.3,0.0),
(51,'2026-08-03','Christine devoe','2022 Toyota Corolla lt 1.8l (oil capacity- 4.6L) (oil type - 0w20) filter - 21394','Oil Change',90.0,null,5.12,null,null,null,'both',2022.0,'Toyota','Corolla','1.8L','0W-20',4.6,'21394',12.6,0.0),
(52,'2026-08-04','Chelsea Davison','2016 Scion IM 1.8l (oil capacity- 4.2L) (oil type - 0w20) filter - 27064','Oil Change',90.0,null,5.06,null,null,null,'both',2016.0,'Scion','iM','1.8L','0W-20',4.2,'27064',12.6,0.0),
(53,'2026-08-06','Jesse Chapdelaine','2012 ford escape 3l (oil capacity- 5.7L) (oil type - 5w20) filter - 27502','Oil Change',124.6,null,4.97,null,null,null,'both',2012.0,'Ford','Escape','3.0L','5W-20',5.7,'27502',16.8,4.6),
(54,'2026-08-07','Elkhidir Elsheikh','2015 Honda Crv','Diagnostics',80.0,null,null,null,null,null,'both',2015.0,'Honda','CR-V',null,null,null,null,11.2,0.0),
(55,'2026-08-08','Heron Patel','2010 hyuandai genesis coupe 3.8l (oil type and capacity 5w20 5.2L) filter - 27250','Oil Change',90.0,null,7.46,null,null,null,'both',2010.0,'Hyundai','Genesis Coupe','3.8L','5W-20',5.2,'27250',12.6,0.0),
(56,'2026-08-11','Alexander Stephenson','2025 hyuandai tucson 1.6l (oil type and capacity 0w20 4.8L) filter - 2100473','Oil Change',110.0,null,14.07,null,null,null,'both',2025.0,'Hyundai','Tucson','1.6L','0W-20',4.8,'2100473',15.4,0.0),
(57,'2026-08-11','Luther downy','2010 ford fusion 2.5l (oil type and capacity 5w20 4.8L) filter - 2100473','Cancelled',40.0,null,5.12,null,null,null,'both',2010.0,'Ford','Fusion','2.5L','5W-20',4.8,'2100473',0.0,0.0),
(58,'2026-08-20','Drew brother','2019 subaru forester 2.5l (oil type and capacity 0w20 4.2L) filter - 27055','Oil Change',110.0,null,6.16,null,null,null,'both',2019.0,'Subaru','Forester','2.5L','0W-20',4.2,'27055',15.4,0.0),
(59,'2026-08-21','Vantez Beals','2006 Honda civic 1.8l (oil type and capacity 5w20 3.7L) filter - 27356','Oil Change',90.0,null,5.12,null,null,null,'both',2006.0,'Honda','Civic','1.8L','5W-20',3.7,'27356',12.6,0.0),
(60,'2026-08-21','Michele Latwaitis','2020 Toyota Corolla 1.8l (oil type and capacity 0w20 4.2L) filter - 21394','Oil Change',90.0,null,5.12,null,null,null,'both',2020.0,'Toyota','Corolla','1.8L','0W-20',4.2,'21394',12.6,0.0),
(61,'2026-08-21','Christopher Hynes','2018 Toyota 4Runner 4.0l v6 (oil type and capacity 0w-20 6.2L) filter - 27173','Oil Change',70.0,null,6.85,null,null,null,'both',2018.0,'Toyota','4Runner','4.0L','0W-20',6.2,'27173',9.8,0.0),
(62,'2026-08-25','Quamari','2013 Nissan maxima 3.5l (oil type and capacity 5w-30 4.8l) filter - 21358','Oil Change',90.0,null,5.12,null,null,null,'mathew70-harsh30',2013.0,'Nissan','Maxima','3.5L','5W-30',4.8,'21358',12.6,0.0),
(63,'2026-08-25','Ellen cohen','2024 hyuandai Santa Fe (oil type and capacity 0w30 5.8l) filter - 2100514','Oil Change',150.0,79.78,15.63,null,null,null,'both',2024.0,'Hyundai','Santa Fe',null,'0W-30',5.8,'2100514',21.0,0.0),
(64,'2026-08-26','Shaquean Bowden','2010 Mercedes c300 v6 (oil type and capacity 5w40 MB 229.3 or MB 229.5 spec 7l) filter - 21226','Oil Change',250.0,125.38,10.17,null,null,null,'both',2010.0,'Mercedes-Benz','C300',null,'Euro 5W-40',7.0,'21226',35.0,0.0),
(65,'2026-08-25','dave hay','2019 honda crv 1.5 turbo (oil capacity 3.7L) (oil type - 0w20) (filter - 27356','Oil Change',90.0,null,5.12,null,null,null,'both',2019.0,'Honda','CR-V','1.5L','0W-20',3.7,'27356',12.6,0.0),
(66,'2026-08-25','dave hay','2015 gmc Sierra 1500 all terrain ( oil capacity -7.6L) (oil type- 0w20) (filter - 2100255','Oil Change',110.0,null,5.38,null,null,null,'both',2015.0,'GMC','Sierra',null,'0W-20',7.6,'2100255',15.4,0.0),
(67,'2026-08-28','Jamya Burrell','2014 Mitsubishi Lancer (2.4L) ( oil capacity -4.4L) (oil type- 0w20) oil filter- 27356 Engine filter- 29023','Oil Change, engine filter',123.06,null,5.12,20.51,null,null,'both.',2014.0,'Mitsubishi','Lancer',null,'0W-20',4.4,'27356',16.8,3.06),
(68,'2026-08-28','akeel sterling','2017 chevy cruze 1.4L (oil capacity- 4l) (oil type - 5w-30) (filter type- 2100290)','Oil Change',102.4,null,5.06,null,null,null,'both',2017.0,'Chevrolet','Cruze','1.4L','5W-30',4.0,'2100290',14.0,2.4),
(69,'2026-09-01','Ivy Anderson','2010 dodge journey','Diagnostic',80.0,null,null,null,null,null,'both',2010.0,'Dodge','Journey',null,null,null,null,11.2,0.0),
(70,'2026-09-01','Stephen Noddin','2013 Toyota tundra 5.7l (oil capacity- 7.5l) (oil type - 0w-20) (filter type- 27041)','Oil Change',130.0,null,7.0,null,null,null,'both',2013.0,'Toyota','Tundra','5.7L','0W-20',7.5,'27041',18.2,0.0),
(71,'2026-09-02','Laura Farrell','2018 mitsubishi eclipse cross 1.5L ( oil capacity- 4.4L) (oil type - 0w20) ( filter type - 27356','Oil Change',120.3,null,5.09,null,null,null,'both',2018.0,'Mitsubishi','Eclipse Cross','1.5L','0W-20',4.4,'27356',16.8,0.3),
(72,'2026-09-02','laura Farrell','2014 chevrolet Orlando 2.4l ( oil capacity- 4.7l oil type - 5w-30) filter - 27082','Oil Change',120.3,null,5.09,null,null,null,'both',2014.0,'Chevrolet','Orlando','2.4L','5W-30',4.7,'27082',16.8,0.3),
(73,'2026-09-03','Andrew Leblanc','2020 Hyundai Kona (2.0 L) • Essential (oil type - 5w20 and capacity 4.2l) filter - 21334','Oil Change',110.0,null,5.12,null,null,null,'both',2020.0,'Hyundai','Kona',null,'5W-20',4.2,'21334',15.4,0.0),
(74,'2026-09-02','Kaleigh Duggan','2020 mitsubish rvr 2.4 (oil type - 0w20 and capacity 4.3l but she brought her own oil and filter) filter - 27356','Oil Change',60.0,null,null,null,null,null,'both',2020.0,'Mitsubishi','RVR','2.4L','0W-20',4.3,'27356',8.4,0.0),
(75,'2026-09-11','Elkhidir elsheikh',null,'Diagnostic',50.0,null,null,null,null,null,'mathew70-harsh30',null,null,null,null,null,null,null,0.0,0.0),
(76,'2026-09-15','Aaron Phillips','2019 Toyota Corolla hatchback 2L (oil type and capacity 0w-16 4.6L has his own oil) filter - 2100332','Oil Change',71.6,null,6.77,null,null,null,'both',2019.0,'Toyota','Corolla','2.0L','0W-16',4.6,'2100332',9.8,1.6),
(77,'2026-09-15','Fortune Ihedori','2014 Subaru forester','Diagnostic',200.0,null,null,6.37,null,null,'both',2014.0,'Subaru','Forester',null,null,null,null,28.0,0.0),
(78,'2026-09-17','Stephanie Gauthier','2020 Mazda Mazda6 Gt reserve 2.5l ( oil type - 5w30) (oil capacity - 4.8L) ( filter type -27002)','Oil Change',107.4,null,5.27,null,null,null,'both',2020.0,'Mazda','Mazda6','2.5L','5W-30',4.8,'27002',12.6,17.4),
(79,'2026-09-22','Amelia Martin','2017 Hyuandai Accent 1.6l ( oil type - 5w20) (oil capacity - 3.6L) ( filter type -21334) 2015 Honda civic 1.8l ( oil type - 0w20) (oil capacity - 3.7L) ( filter type - 27356)','Oil Change',200.0,null,19.74,null,null,null,'both',2017.0,'Hyundai','Accent','1.6L','5W-20',3.6,'21334',28.0,0.0),
(80,'2026-09-25','Queen p','2025 Hyuandai Tucson Hybrid 1.6L ( oil type - 0w20) (oil capacity - 4.9L) ( filter type -2100473)','Oil Change',110.0,null,19.6,null,null,null,'both',2025.0,'Hyundai','Tucson','1.6L','0W-20',4.9,'2100473',15.4,0.0),
(81,'2026-09-26','Adewale Isaac adefiranye','2015 Hyundai sonata 2.4 (oil type and capacity - 5w-20 4.8l) filter type- 21334','Oil Change',98.0,null,10.07,null,null,null,'both',2015.0,'Hyundai','Sonata','2.4L','5W-20',4.8,'21334',13.72,0.0),
(82,'2026-09-26','Justin Townsend','2019 Honda civic (oil type and capacity, 0w-20 3.5 l) filter - 27356','Oil Change',90.0,null,5.12,null,null,null,'both',2019.0,'Honda','Civic',null,'0W-20',3.5,'27356',12.6,0.0),
(83,'2026-09-26','Keegan Carreau-Burns','2015 Mazda 3 2L (oil type and capacity 0w_20 4.2L) filter - 27002','Oil Change / stripped bolt extract/ couldn''t be done as couldn''t get the bolt out',39.21,null,7.27,8.76,null,null,'both',2015.0,'Mazda','3','2.0L','0W-20',4.2,'27002',0.0,0.0),
(84,'2026-10-04','Chris Wright','2024 honda civic ex 2.0L (oil type 0w-20) (oil capacity- 4.2l) filter - 27356','Oil Change',90.0,null,9.68,null,null,null,'both',2024.0,'Honda','Civic','2.0L','0W-20',4.2,'27356',12.6,0.0),
(85,'2026-09-30','Malkeet Singh','2022 Toyota Camry 2.5l oil type and capacity 0w-16 4.5L filter - 2100332','Oil Change',110.0,null,9.34,null,null,null,'both',2022.0,'Toyota','Camry','2.5L','0W-16',4.5,'2100332',15.4,0.0),
(86,'2026-09-30','Shauna McNeil','2025 Honda pilot 3.5 l oil type and capacity 0w-20 5.5l filter - 27356','Oil Change',140.0,null,9.68,null,null,null,'both',2025.0,'Honda','Pilot','3.5L','0W-20',5.5,'27356',19.6,0.0),
(87,'2026-10-01','Morgan grosse','2018 jeep grand cherokee limited 3.6l (oil type 0w-20) (oil capacity- 5.9l) (oil Filter - 2100010)','Oil Change',120.0,null,9.68,null,null,null,'both',2018.0,'Jeep','Grand Cherokee','3.6L','0W-20',5.9,'2100010',16.8,0.0),
(88,'2026-10-03','Amaan Mohammad','Nissans Altima 2013 SV 2.5L 4 cylinder(oil type and capacity 0w-20 4.6L) filter - 21358','Oil Change',90.0,null,9.68,null,null,null,null,2013.0,'Nissan','Altima','2.5L','0W-20',4.6,'21358',12.6,0.0),
(89,'2026-10-03','Candace sharron','2021 ram 1500 classic Warlock 5.7l (oil type -5w20) (oil capacity - 7L) (Filter - 27060)','Oil Change',141.8,null,9.79,null,null,null,null,2021.0,'Ram','1500','5.7L','5W-20',7.0,'27060',18.2,11.8),
(90,'2026-10-04','Shannon McNeil','2016 Chevy trax lt 1.4l (oil type and capacity 5w30 4l) filter - 27674','Oil Change',114.6,null,9.55,null,null,null,null,2016.0,'Chevrolet','Trax','1.4L','5W-30',4.0,'27674',15.4,4.6),
(91,'2026-10-10','Thomson Benny','2019 Honda accord 1.5l (oil capacity 0w-20 3.5l) filter - 27356','Oil Change',90.0,null,9.68,null,null,null,null,2019.0,'Honda','Accord','1.5L','0W-20',3.5,'27356',12.6,0.0),
(92,'2026-10-10','Steven','2020 Nissan pathfinder 3.5l (oil type and capacity 0w-20 4.8l) filter - 21358','Oil Change',120.0,null,null,null,null,null,null,2020.0,'Nissan','Pathfinder','3.5L','0W-20',4.8,'21358',16.8,0.0),
(93,'2026-10-10','Steven','2021 Chevy equinox 1.5l oil type and capacity 0w-20 4l ) filter -','Oil Change',120.0,null,11.39,null,null,null,null,2021.0,'Chevrolet','Equinox','1.5L','0W-20',4.0,null,16.8,0.0),
(94,'2026-10-13','Sarah Craig','2024 Toyota grand highlander 2.5l hybrid (oil type and capacity 0w-8 4.3l) but we used 0w20 and put 5.3l so lost 1l of oil filter - 2100332','Oil Change',120.0,null,9.34,null,null,null,null,2024.0,'Toyota','Grand Highlander','2.5L','0W-8',4.3,'2100332',16.8,0.0),
(95,'2026-10-13','Michael Parker','2018 Chevy Cruze cabin filter - 224211','Cabin Air Filter and engine filter',185.0,null,null,136.48,null,null,null,2018.0,'Chevrolet','Cruze',null,null,null,null,25.9,0.0),
(96,'2026-10-13','Dheeraj Jadhav','2016 Honda pilot 3.5l oil type and capacity 0w20 5.4l filter - 27356','Oil Change wiper blades change',170.0,null,9.68,22.78,null,null,null,2016.0,'Honda','Pilot','3.5L','0W-20',5.4,'27356',21.7,0.0),
(97,'2026-10-14','steven','2020 Nissan pathfinder 3.5l','Cabin Air Filter and engine air filter',100.0,null,null,32.92,null,null,null,2020.0,'Nissan','Pathfinder','3.5L',null,null,null,14.0,0.0),
(98,'2026-10-15','Victor Amani','2012 Chrysler 200 (2.4l) ( oil type- 0w20) (oil capacity- 4.4l) (filter - 27060','Oil Change',92.4,null,9.79,null,null,null,null,2012.0,'Chrysler','200',null,'0W-20',4.4,'27060',12.6,2.4),
(99,'2026-10-16','Vincent Jones','2019 Chevrolet Malibu LT 1.5l ( oil type - 5w-30) (oil capacity- 4l) (filter type - 2100290)','Oil Change',90.0,null,7.27,null,null,null,null,2019.0,'Chevrolet','Malibu','1.5L','5W-30',4.0,'2100290',12.6,0.0),
(100,'2026-10-19','harsh Patel','2022 Hyundai Tucson Hybrid 2.5l (oil type - 0w20) (oil capacity 5.8l) (filter type - 2100514)','Oil Change',110.0,null,null,null,null,null,null,2022.0,'Hyundai','Tucson','2.5L','0W-20',5.8,'2100514',15.4,0.0),
(101,'2026-10-18','Crystal Jayne','2019 Acura ilx 2.4l (oil type - 0w20) (oil capacity 4.2l) (filter type - 27356)','Oil Change',90.0,null,9.68,null,null,null,null,2019.0,'Acura','ILX','2.4L','0W-20',4.2,'27356',12.6,0.0),
(102,'2026-10-19','Chloe Hayward','2018 Honda Crv 1.5l (oil type and capacity 0w20 3.5l) filter - 27356','Oil Change',130.0,null,9.68,null,null,null,null,2018.0,'Honda','CR-V','1.5L','0W-20',3.5,'27356',18.2,0.0),
(103,'2026-10-21','Andrew Leblanc','2020 Hyundai Kona (2.0 L) • Essential (oil type - 5w20 and capacity 4.2l) filter - 21334 customer provided oil','Oil Change',70.0,null,null,null,null,null,null,2020.0,'Hyundai','Kona',null,'5W-20',4.2,'21334',9.8,0.0),
(104,'2026-10-23','Nikki Sullivan','2016 Honda civic, customer providing oil and filter, capacity is','Oil Change',80.0,null,null,null,null,null,null,2016.0,'Honda','Civic',null,null,null,null,11.2,0.0),
(105,'2026-10-17','Monica Van Zoomeren','2022 Hyundai Tucson 2.5l (oil type - 0w20) (oil capacity 5.8l) (filter type - 2100514)','Oil Change',120.0,null,null,null,null,null,null,2022.0,'Hyundai','Tucson','2.5L','0W-20',5.8,'2100514',16.8,0.0),
(106,'2026-10-17','Monica Van Zoomeren','2021 vw Altas 3.6L (oil type and capacity 0w-30 euro 5.5l) filter - 27462','Oil Change',195.0,106.0,13.1,null,null,null,null,2021.0,'Volkswagen','Atlas','3.6L','Euro 0W-30',5.5,'27462',27.3,0.0),
(107,'2026-10-18','Andrew Coates','2021 Honda Crv 1.5l (oil type and capacity 0w20 3.5l) filter - 27356','Oil Change',110.0,null,9.68,null,null,null,null,2021.0,'Honda','CR-V','1.5L','0W-20',3.5,'27356',15.4,0.0),
(108,'2026-10-19','Sean Wilson','2016 Honda civic 2L (oil type and capacity 0w20 4.2L) filter - 27356','Oil Change',97.4,null,null,null,null,null,null,2016.0,'Honda','Civic','2.0L','0W-20',4.2,'27356',12.6,7.4),
(109,'2026-10-20','Devanshu Patel','2016 Chevrolet Malibu LT 1.5l ( oil type - 0w20) (oil capacity- 4l) (filter type - 2100290) $15 off came late','Oil Change',75.0,null,null,null,null,null,null,2016.0,'Chevrolet','Malibu','1.5L','0W-20',4.0,'2100290',10.5,0.0),
(110,'2026-10-20','Pat henneberry','2017 Honda civic 2L (oil type and capacity 0w20 4.2L) filter - 27356','Oil Change',90.0,null,null,null,null,null,null,2017.0,'Honda','Civic','2.0L','0W-20',4.2,'27356',12.6,0.0),
(111,'2026-10-21','Gureet','2014 Subaru Impreza 2l (oil type and capacity 0w20 4.8l) filter - 27055','Oil Change',90.0,null,null,null,null,null,null,2014.0,'Subaru','Impreza','2.0L','0W-20',4.8,'27055',12.6,0.0),
(112,'2026-10-21','Cheung Tsun Fung','2013 Honda civic. Lx (oil type and capacity 0w20 3.8l) filter - 27356','Oil Change',90.0,null,null,null,null,null,null,2013.0,'Honda','Civic',null,'0W-20',3.8,'27356',12.6,0.0),
(113,'2026-10-24','Rod smith','2024 hyundai elantra 2L (oil capacity - 4.5L) (oil type 0w-20) (oil filter- 2100521)','Oil Change',105.0,null,null,null,null,null,null,2024.0,'Hyundai','Elantra','2.0L','0W-20',4.5,'2100521',14.7,0.0),
(114,'2026-10-22','Salah','2014 ford fusion se (oil type and capacity 5w20 5.4l) filter - 21348','Oil Change',97.4,null,null,null,null,null,null,2014.0,'Ford','Fusion',null,'5W-20',5.4,'21348',12.6,7.4),
(115,'2026-10-23','Morgan MacKinnon','2025 Honda Crv 2.0 l hybrid (oil type and capacity 0w-20 4.3l) filter - 27356','Oil Change and tire change',185.0,null,null,null,null,null,null,2025.0,'Honda','CR-V','2.0L','0W-20',4.3,'27356',25.9,0.0),
(116,'2026-10-23','Morgan MacKinnon','2019 Honda civic 2L (oil type and capacity 0w20 4.2L) filter - 27356','Oil Change and tire change',155.0,null,null,null,null,null,null,2019.0,'Honda','Civic','2.0L','0W-20',4.2,'27356',21.7,0.0),
(117,'2026-10-22','Vantez Beals','2006 Honda civic 1.8l (oil type and capacity 5w20 3.7L) filter - 27356','Oil Change',90.0,null,null,null,null,null,null,2006.0,'Honda','Civic','1.8L','5W-20',3.7,'27356',12.6,0.0),
(118,'2026-10-22','Ayush','2008 honda accord 2.4l (oil type and capacity 5w20 4.2l) filter - 27356','Oil Change',90.0,null,null,null,null,null,null,2008.0,'Honda','Accord','2.4L','5W-20',4.2,'27356',12.6,0.0),
(119,'2026-10-22','Donna MacDonald','2018 Subaru outback 2.5L (oil type and capacity 0w20 4.8l) filter - 21334','Oil Change',135.08,null,null,null,null,null,null,2018.0,'Subaru','Outback','2.5L','0W-20',4.8,'21334',18.2,5.08);

-- match each name to a customer: best name similarity, needs 0.45+
update jt set customer_id = m.id, score = m.s from (
  select distinct on (jt.n) jt.n, c.id,
    similarity(lower(jt.name), lower(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')))) s
  from jt cross join customers c
  order by jt.n, s desc
) m where m.n = jt.n and m.s >= 0.45;

-- one-word names (e.g. 'Karan') only match if exactly one customer has that first name
update jt set customer_id = c.id, score = 0.9 from customers c
where jt.customer_id is null and jt.name !~ ' '
  and lower(trim(c.first_name)) = lower(jt.name)
  and (select count(*) from customers c2 where lower(trim(c2.first_name)) = lower(jt.name)) = 1;

-- anyone still unmatched becomes a new customer (no phone), so no history is lost
insert into customers (first_name, last_name, notes, source)
select distinct initcap(split_part(name,' ',1)), nullif(initcap(substr(name, length(split_part(name,' ',1))+2)),''),
  'Added from Job Tracker (not found in Square)', 'job_tracker'
from jt where customer_id is null
  and not exists (select 1 from customers c where c.source='job_tracker'
    and lower(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,''))) = lower(jt.name));
update jt set customer_id = c.id, score = 0 from customers c
where jt.customer_id is null and c.source='job_tracker'
  and lower(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,''))) = lower(jt.name);

create table if not exists jt_review (n int, d date, name text, customer_id uuid, score real);
truncate jt_review;
insert into jt_review select n,d,name,customer_id,score from jt;
alter table jt_review enable row level security;

-- vehicles: one per customer + year + make + model
insert into vehicles (customer_id, year, make, model, engine, source)
select distinct on (customer_id, yr, make, model) customer_id, yr, make, model, engine, 'job_tracker'
from jt where make is not null
  and not exists (select 1 from vehicles v where v.customer_id = jt.customer_id and v.year is not distinct from jt.yr
    and v.make = jt.make and v.model is not distinct from jt.model);
update jt set vehicle_id = v.id from vehicles v
where v.customer_id = jt.customer_id and v.year is not distinct from jt.yr and v.make = jt.make and v.model is not distinct from jt.model;

-- jobs
insert into jobs (customer_id, vehicle_id, done_at, oil_grade, oil_litres, revenue, cost_oil, cost_parts, cost_other,
  service, payment_method, split, notes, filter_part, vehicle_text, imported_from, hst, tip, next_due_date)
select customer_id, vehicle_id, (d + time '12:00') at time zone 'America/Halifax', grade, cap, price, oil, filt, other,
  service, method, split, notes, filter, raw, 'job_tracker', hst, tip,
  -- oil changes are due again in 6 months (same rule HQ uses), so old customers get the reminder too
  case when service ilike '%oil%' then (d + interval '6 months')::date end
from jt order by n;

-- link each job to its Square booking on the same day, when there is exactly one
update jobs j set booking_id = b.id from bookings b
where j.imported_from = 'job_tracker' and j.booking_id is null and b.customer_id = j.customer_id
  and (b.starts_at at time zone 'America/Halifax')::date = (j.done_at at time zone 'America/Halifax')::date
  and (select count(*) from bookings b2 where b2.customer_id = j.customer_id
       and (b2.starts_at at time zone 'America/Halifax')::date = (j.done_at at time zone 'America/Halifax')::date) = 1;

-- a job in the sheet means it was done: close its booking so HQ doesn't ask to finish it again
update bookings b set status = 'done', finished_at = coalesce(b.finished_at, j.done_at), paid_at = coalesce(b.paid_at, j.done_at)
from jobs j where j.booking_id = b.id and j.imported_from = 'job_tracker' and b.status in ('requested', 'confirmed', 'in_progress');
-- payments typed in HQ against a job that's already in the sheet are duplicates (the sheet already counts it)
delete from payments p using jobs j where j.booking_id = p.booking_id and j.imported_from = 'job_tracker' and p.processor_ref like 'recorded by %';

-- expenses
insert into expenses (spent_at, description, category, total, subtotal, hst, source, parsed) values
(coalesce('2026-05-20'::date, current_date),'Gloves','supplies',92.23,80.9,11.33,'expense_tracker',null::jsonb),
(coalesce('2026-06-01'::date, current_date),'Google ads','other',83.0,83.0,0,'expense_tracker','{"notes": "depends on clicks "}'::jsonb),
(coalesce('2026-06-01'::date, current_date),'Instagram ads','other',119.91,119.91,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-01'::date, current_date),'TikTok ads','other',91.2,91.2,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-01'::date, current_date),'facebook','other',172.5,172.5,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-11'::date, current_date),'Vehicle insurance','insurance',158.35,158.35,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-12'::date, current_date),'Filter wrench','tools',35.55,31.18,4.37,'expense_tracker',null::jsonb),
(coalesce('2026-06-19'::date, current_date),'Logo decals','supplies',51.3,45.0,6.3,'expense_tracker',null::jsonb),
(coalesce('2026-06-26'::date, current_date),'Drain plug gasket','supplies',146.8,128.77,18.03,'expense_tracker',null::jsonb),
(coalesce('2026-06-26'::date, current_date),'Commercial insurance','insurance',554.0,554.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-27'::date, current_date),'Asam','other',27.84,27.84,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-28'::date, current_date),'Funnel','supplies',10.25,8.99,1.26,'expense_tracker',null::jsonb),
(coalesce('2026-07-02'::date, current_date),'Google ads','other',150.0,150.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-06-30'::date, current_date),'BMO','other',0.25,0.25,0,'expense_tracker',null::jsonb),
(coalesce('2026-05-30'::date, current_date),'BMO','other',0.25,0.25,0,'expense_tracker',null::jsonb),
(coalesce('2026-07-02'::date, current_date),'Oil','oil',1003.02,879.84,123.18,'expense_tracker',null::jsonb),
(coalesce('2026-07-02'::date, current_date),'Google ads','other',7.46,7.46,0,'expense_tracker',null::jsonb),
(coalesce('2026-07-09'::date, current_date),'truck decal','other',35.0,30.7,4.3,'expense_tracker',null::jsonb),
(coalesce('2026-07-11'::date, current_date),'Vehicle insurance','insurance',158.35,158.35,0,'expense_tracker',null::jsonb),
(coalesce('2026-07-15'::date, current_date),'Gas','gas',120.75,105.92,14.83,'expense_tracker',null::jsonb),
(coalesce('2026-07-15'::date, current_date),'Commercial insurance','insurance',-554.0,-554.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-07-14'::date, current_date),'Oil','oil',125.38,109.98,15.4,'expense_tracker',null::jsonb),
(coalesce('2026-07-28'::date, current_date),'Google','other',250.0,250.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-08-03'::date, current_date),'Gas','gas',104.26,91.46,12.8,'expense_tracker',null::jsonb),
(coalesce('2026-08-05'::date, current_date),'Filter','filters',5.12,4.49,0.63,'expense_tracker',null::jsonb),
(coalesce('2026-08-07'::date, current_date),'Absorbent pads','supplies',84.23,73.89,10.34,'expense_tracker',null::jsonb),
(coalesce('2026-08-07'::date, current_date),'Battery','supplies',8.04,7.05,0.99,'expense_tracker',null::jsonb),
(coalesce('2026-08-04'::date, current_date),'Google','other',110.16,110.16,0,'expense_tracker',null::jsonb),
(coalesce('2026-08-04'::date, current_date),'Google','other',33.82,33.82,0,'expense_tracker',null::jsonb),
(coalesce('2026-08-15'::date, current_date),'Insurance','insurance',158.35,158.35,0,'expense_tracker',null::jsonb),
(coalesce('2026-08-19'::date, current_date),'Truck repair','other',2097.88,1840.25,257.63,'expense_tracker',null::jsonb),
(coalesce('2026-08-26'::date, current_date),'Gas','gas',117.12,102.74,14.38,'expense_tracker',null::jsonb),
(coalesce('2026-08-28'::date, current_date),'Oil','oil',155.02,135.98,19.04,'expense_tracker',null::jsonb),
(coalesce('2026-09-01'::date, current_date),'Carpet and absorbent','supplies',124.9,109.56,15.34,'expense_tracker',null::jsonb),
(coalesce('2026-08-31'::date, current_date),'BMO','other',0.75,0.75,0,'expense_tracker',null::jsonb),
(coalesce('2026-08-28'::date, current_date),'Google ad','other',500.0,500.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-09-11'::date, current_date),'Insurance','insurance',158.35,158.35,0,'expense_tracker',null::jsonb),
(coalesce('2026-09-03'::date, current_date),'Google ad','other',76.09,76.09,0,'expense_tracker',null::jsonb),
(coalesce('2026-09-17'::date, current_date),'Gas','gas',118.03,103.54,14.49,'expense_tracker',null::jsonb),
(coalesce('2026-09-22'::date, current_date),'Oil and shop towels','supplies and oil',183.51,160.97,22.54,'expense_tracker',null::jsonb),
(coalesce('2026-10-01'::date, current_date),'East Coast Lubricants - 4 cases full synthetic oil','oil',551.76,484.0,67.76,'expense_tracker','{"notes": "Invoice #297: 20L each 0W-16, 0W-20, 5W-20, 5W-30 (80L total). Current after-HST cost/L: 0W-16 $7.30; 0W-20 $7.07; 5W-20 $6.61; 5W-30 $6.61. Invoice total $551.76."}'::jsonb),
(coalesce('2026-10-02'::date, current_date),'Google ad','other',436.55,436.55,0,'expense_tracker',null::jsonb),
(coalesce('2026-10-01'::date, current_date),'Elavon charge','other',0.43,0.43,0,'expense_tracker',null::jsonb),
(coalesce('2026-09-29'::date, current_date),'BMO','other',5.25,5.25,0,'expense_tracker',null::jsonb),
(coalesce('2026-10-06'::date, current_date),'Truck insurance','insurance',1344.0,1344.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-10-10'::date, current_date),'Gas','gas',100.0,87.72,12.28,'expense_tracker',null::jsonb),
(coalesce('2026-10-15'::date, current_date),'Parking ticket','other',50.0,50.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-10-14'::date, current_date),'Golf course ad','other',578.57,507.52,71.05,'expense_tracker','{"notes": "This is for the next year"}'::jsonb),
(coalesce('2026-10-16'::date, current_date),'Truck arrangers','supplies',65.78,57.7,8.08,'expense_tracker',null::jsonb),
(coalesce('2026-10-17'::date, current_date),'36mm Sckt','tools',14.81,12.99,1.82,'expense_tracker',null::jsonb),
(coalesce('2026-10-17'::date, current_date),'Gas','gas',123.77,108.57,15.2,'expense_tracker',null::jsonb),
(coalesce('2026-10-19'::date, current_date),'Filter','filters',51.64,45.3,6.34,'expense_tracker',null::jsonb),
(coalesce('2026-10-17'::date, current_date),'Square payment fees','other',8.69,8.69,0,'expense_tracker',null::jsonb),
(coalesce('2026-10-19'::date, current_date),'Oil','oil',166.42,145.98,20.44,'expense_tracker',null::jsonb),
(coalesce('2026-10-20'::date, current_date),'Filter','filters',17.34,15.21,2.13,'expense_tracker',null::jsonb),
(coalesce('2026-10-20'::date, current_date),'Filter','filters',27.9,24.47,3.43,'expense_tracker',null::jsonb),
(coalesce('2026-10-20'::date, current_date),'Filter','filters',9.68,8.49,1.19,'expense_tracker',null::jsonb),
(coalesce('2026-10-20'::date, current_date),'Filter','filters',36.39,31.92,4.47,'expense_tracker',null::jsonb),
(coalesce('2026-10-23'::date, current_date),'Filter','filters',9.68,8.49,1.19,'expense_tracker',null::jsonb),
(coalesce('2026-10-23'::date, current_date),'Gas','gas',114.86,100.75,14.11,'expense_tracker',null::jsonb),
(coalesce('2026-10-23'::date, current_date),'Oil','oil',88.91,77.99,10.92,'expense_tracker',null::jsonb),
(coalesce('2026-10-24'::date, current_date),'Website searcher','other',8.0,8.0,0,'expense_tracker',null::jsonb),
(coalesce('2026-10-24'::date, current_date),'Website searcher','other',15.99,15.99,0,'expense_tracker',null::jsonb);

-- oil / filters / gas used on jobs that were never logged as an expense (see 'Costs' in the script)
insert into expenses (spent_at, description, category, total, subtotal, hst, source) values
('2026-05-27'::date,'Oil used on jobs in May (from Job Tracker, not in Expense Tracker)','oil',218.3,191.49,26.81,'job_tracker_costs'),
('2026-05-27'::date,'Filters and parts used on jobs in May (from Job Tracker, not in Expense Tracker)','filters',59.67,52.34,7.33,'job_tracker_costs'),
('2026-05-27'::date,'Gas used on jobs in May (from Job Tracker, not in Expense Tracker)','gas',153.23,134.41,18.82,'job_tracker_costs'),
('2026-06-28'::date,'Oil used on jobs in June (from Job Tracker, not in Expense Tracker)','oil',521.43,457.39,64.04,'job_tracker_costs'),
('2026-06-28'::date,'Filters and parts used on jobs in June (from Job Tracker, not in Expense Tracker)','filters',202.32,177.47,24.85,'job_tracker_costs'),
('2026-06-28'::date,'Gas used on jobs in June (from Job Tracker, not in Expense Tracker)','gas',132.99,116.66,16.33,'job_tracker_costs'),
('2026-07-28'::date,'Filters and parts used on jobs in July (from Job Tracker, not in Expense Tracker)','filters',179.07,157.08,21.99,'job_tracker_costs'),
('2026-08-28'::date,'Filters and parts used on jobs in August (from Job Tracker, not in Expense Tracker)','filters',132.04,115.82,16.22,'job_tracker_costs'),
('2026-09-30'::date,'Filters and parts used on jobs in September (from Job Tracker, not in Expense Tracker)','filters',130.29,114.29,16.0,'job_tracker_costs'),
('2026-10-24'::date,'Filters and parts used on jobs in October (from Job Tracker, not in Expense Tracker)','filters',187.22,164.23,22.99,'job_tracker_costs');

commit;

-- REVIEW: names that were matched loosely or added as new customers
select n as "row", d as "date", name as "job tracker name",
  case when score = 0 then 'NEW customer (not in Square)'
       else trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) end as "matched to",
  round(score::numeric,2) as "match"
from jt_review r left join customers c on c.id = r.customer_id
where score < 0.75 order by score, n;
