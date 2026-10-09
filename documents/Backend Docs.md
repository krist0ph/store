Backend dokumentáció
1. Áttekintés

A projekt egy Node.js és Express alapú webáruház-backend, amely SQLite adatbázist használ az adatok tárolására. A backend REST API-n keresztül biztosítja a felhasználókezelést, a termékek lekérdezését és szűrését, a kosár kezelését, a rendelésfeladást, a rendelések kezelését, valamint a szállítási adatok módosítását.

A felhasználói hitelesítés munkamenet-alapú, a jelszavak hash-elve kerülnek tárolásra. A rendelések fizetési módja utánvét (Cash on Delivery).

Főbb funkciók
Regisztráció, bejelentkezés és kijelentkezés.
Jelszómódosítás.
Felhasználói profil lekérdezése.
Termékek listázása, keresése, rendezése és szűrése.
Termékadatok lekérdezése azonosító alapján.
Bevásárlókosár kezelése.
Rendelések leadása és részleteinek lekérdezése.
Rendelések lemondása.
Rendelések szállítási adatainak módosítása.
Felhasználói és munkamenet-adatok tárolása SQLite adatbázisokban.
Rate limiting a regisztrációs, bejelentkezési és jelszómódosítási végpontokon.
2. Technológiák
Technológia	Felhasználás
Node.js	JavaScript futtatókörnyezet
Express.js	HTTP-szerver és REST API
SQLite	Relációs adatbázis
better-sqlite3	SQLite adatbázis-kezelés
bcrypt	Jelszavak hash-elése és ellenőrzése
express-session	Munkamenet-kezelés
better-sqlite3-session-store	Munkamenetek tárolása SQLite adatbázisban
express-rate-limit	Kérések korlátozása
dotenv	Környezeti változók betöltése
crypto	Egyedi felhasználói azonosítók generálása
3. Telepítés és indítás
3.1. Előfeltételek
Telepített Node.js.
npm csomagkezelő.
A projekt függőségei.
Megfelelően konfigurált környezeti változók.
A szükséges SQLite adatbázisok és táblák.
3.2. Függőségek telepítése

A projekt gyökérkönyvtárában futtasd:

npm install express bcrypt better-sqlite3 express-rate-limit express-session better-sqlite3-session-store dotenv

3.3. Környezeti változók

Hozz létre egy .env fájlt a projekt gyökérkönyvtárában:

SESSION_SECRET=replace_with_a_long_random_secret
NODE_ENV=development


A SESSION_SECRET kötelező. Ha hiányzik, a szerver nem indul el.

A titkos kulcs generálásához használható például:

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"


A generált értéket másold a .env fájl SESSION_SECRET változójába.

Fontos: a .env fájlt ne töltsd fel nyilvános verziókezelő-tárolóba.

3.4. A szerver indítása

Ha a belépési fájl neve server.js, futtasd:

node server.js


A szerver a 1000-es porton indul el.

Alapértelmezett cím:

http://localhost:1000

4. Adatbázisok

A backend két SQLite adatbázist használ.

4.1. database.db

Az alkalmazás üzleti adatait tárolja.

A kódban használt táblák:

Tábla	Feladat
users	Felhasználók, e-mail-címek, jelszóhash-ek és profiladatok
products	Termékek, árak, gyártók, színek és készlet
cart	Felhasználói kosártartalom
orders	Rendelések és rendelési állapotok
order_items	A rendelésekhez tartozó termékek és árak
4.2. sessions.db

Az express-session munkamenet-adatainak tárolására szolgál.

A munkamenet-táblát a használt session store kezeli.

Megjegyzés: a backend kódja nem hozza létre automatikusan az üzleti táblák sémáját. A database.db adatbázisban a szükséges tábláknak és oszlopoknak már létezniük kell.

A kódból az alábbi mezők használata állapítható meg:

users: id, email, password, shipping_info
products: product_id, name, manufacturer, color, price, onstock
cart: user_id, product_id, quantity, total_price
orders: id, user_id, status, shipping_info, creation_date
order_items: order_id, product_id, product_name, unit_price, quantity, total_price

Az oszlopok adattípusait, az idegen kulcsokat és a további megszorításokat az adatbázis tényleges sémája határozza meg.

5. Általános API-információk
5.1. Alap URL
http://localhost:1000

5.2. Adatformátum

A backend JSON formátumú válaszokat ad.

A JSON-t küldő kliensnek általában ezt a fejlécet kell használnia:

Content-Type: application/json


Példa kérésre:

POST /api/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "example-password"
}

5.3. Munkamenet és hitelesítés

A backend munkamenet-alapú hitelesítést használ.

Sikeres bejelentkezéskor a szerver munkamenetet hoz létre, és a kliens számára egy sid nevű cookie-t állít be. A védett végpontokhoz ezt a cookie-t a kliensnek meg kell őriznie és a későbbi kérésekkel együtt el kell küldenie.

A cookie beállításai:

httpOnly: true
sameSite: 'lax'
secure: true, ha a NODE_ENV értéke production
Élettartam: 7 nap

A védett végpontok bejelentkezés nélkül 401 Unauthorized választ adnak.

Böngészős frontend esetén, ha a frontend és a backend külön originről működik, a kliensoldali kéréseknél a cookie-k továbbítását is konfigurálni kell, például credentials: 'include' használatával. Ehhez megfelelő CORS-konfigurációra is szükség lehet.

6. API-végpontok
6.1. Hitelesítés
GET /register

A regisztrációs HTML-oldalt szolgálja ki.

Sikeres válasz: a static/register.html tartalma.

POST /api/register

Új felhasználó regisztrálása.

Kérés törzse:

{
  "email": "user@example.com",
  "password": "example-password"
}


Validáció:

Az email és a password szöveges érték kell legyen.
Mindkét mező megadása kötelező.
Az e-mail-címnek érvényes formátumúnak kell lennie, legfeljebb 254 karakterrel.
A jelszónak legalább 8 karakter hosszúnak kell lennie.
A jelszó legfeljebb 72 bájt lehet UTF-8 kódolásban.
Az e-mail-cím tárolás előtt kisbetűssé és szóközmentessé normalizálódik.
A jelszó bcrypt segítségével, 10-es költségi faktorral kerül hash-elésre.

Sikeres válasz – 201 Created:

{
  "message": "User registered successfully"
}


Lehetséges hibák:

400 Bad Request – hibás vagy hiányos regisztrációs adatok.
409 Conflict – az e-mail-cím már regisztrálva van.
500 Internal Server Error – a regisztráció nem sikerült.

A végpont rate limitinget alkalmaz.

GET /login

A bejelentkezési HTML-oldalt szolgálja ki.

Sikeres válasz: a static/login.html tartalma.

POST /api/login

Felhasználó bejelentkeztetése.

Kérés törzse:

{
  "email": "user@example.com",
  "password": "example-password"
}


Működés:

A backend megkeresi a felhasználót az e-mail-címe alapján.
A megadott jelszót bcrypt segítségével ellenőrzi.
Ismeretlen felhasználó esetén is végez egy dummy hash-ellenőrzést az időzítési különbségek csökkentése érdekében.
Sikeres hitelesítéskor megújítja a munkamenetet.
A felhasználó azonosítóját elmenti a munkamenetbe.

Sikeres válasz – 200 OK:

{
  "message": "Login successful"
}


Lehetséges hibák:

400 Bad Request – hibás vagy hiányzó hitelesítési adatok.
401 Unauthorized – érvénytelen e-mail-cím vagy jelszó.
500 Internal Server Error – a bejelentkezés nem sikerült.

A végpont rate limitinget alkalmaz, a sikeres kéréseket pedig nem számítja bele a korlátozási számlálóba.

POST /api/logout

A felhasználó kijelentkeztetése.

Hitelesítés: nem kötelező.

Működés:

Megsemmisíti az aktuális munkamenetet.
Törli a sid cookie-t a válaszban.

Sikeres válasz – 200 OK:

{
  "message": "Logged out"
}


Hibák:

500 Internal Server Error – a munkamenet törlése nem sikerült.
POST /api/change-password

A bejelentkezett felhasználó jelszavának módosítása.

Hitelesítés: kötelező.

Kérés törzse:

{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}


Validáció:

Mindkét mezőnek szövegnek kell lennie.
Az új jelszó legalább 8 karakter hosszú.
Az új jelszó legfeljebb 72 bájt lehet UTF-8 kódolásban.
Az új jelszó nem egyezhet meg a jelenlegivel.
A jelenlegi jelszó helyességét a backend ellenőrzi.

Sikeres módosításkor az új jelszó hash-elve kerül mentésre. A backend törli az adott felhasználó többi munkamenetét, miközben az aktuális munkamenetet megtartja.

Sikeres válasz – 200 OK:

{
  "message": "Password changed successfully"
}


Lehetséges hibák:

400 Bad Request – hibás adatok, túl rövid vagy túl hosszú jelszó, illetve változatlan jelszó.
401 Unauthorized – a felhasználó nincs bejelentkezve, vagy a felhasználói rekord már nem létezik.
403 Forbidden – hibás jelenlegi jelszó.
500 Internal Server Error – a módosítás nem sikerült.

A végpont rate limitinget alkalmaz.

6.2. Felhasználói profil
GET /api/profile

Lekéri a bejelentkezett felhasználó profiladatait.

Hitelesítés: kötelező.

Sikeres válasz – 200 OK:

{
  "id": "user-uuid",
  "email": "user@example.com",
  "shippingInfo": {
    "email": "user@example.com",
    "address": "Example Street 10."
  }
}


A shippingInfo értéke null is lehet, ha nincs mentett szállítási információ. A példa csak szemléltető adatokat tartalmaz.

Válaszmezők:

id: a felhasználó egyedi azonosítója.
email: a felhasználó e-mail-címe.
shippingInfo: a mentett szállítási adatok.

Hibák:

401 Unauthorized – a felhasználó nincs bejelentkezve, vagy nem található.
500 Internal Server Error – a profil lekérése sikertelen.
6.3. Termékek
GET /api/products

Termékek listázása kereséssel, szűréssel, rendezéssel és lapozással.

Hitelesítés: nem szükséges.

Támogatott query paraméterek:

Paraméter	Típus	Alapértelmezett	Leírás
search	string	nincs	Keresés a termék nevében, gyártójában és színében
sort	string	newest	Rendezési mód
color	string vagy tömb	nincs	Színszűrés, vesszővel elválasztva is
manufacturer	string vagy tömb	nincs	Gyártószűrés, vesszővel elválasztva is
minPrice	number	nincs	Minimális ár
maxPrice	number	nincs	Maximális ár
inStock	boolean szövegként	nincs	Csak készleten lévő termékek, ha true
page	pozitív egész	1	Aktuális oldal
limit	pozitív egész	20	Oldalankénti termékek száma, maximum 100

Elérhető rendezési módok:

newest – azonosító szerint csökkenő sorrend.
name_asc – név szerint növekvő sorrend.
name_desc – név szerint csökkenő sorrend.
price_asc – ár szerint növekvő sorrend.
price_desc – ár szerint csökkenő sorrend.

A név szerinti rendezés ékezeteket figyelmen kívül hagyó normalizált szöveggel történik.

A keresés legfeljebb öt szóra korlátozódik. A szavak mindegyikének egyeznie kell a keresési feltételekkel, miközben az egyes szavak a névben, a gyártóban vagy a színben is előfordulhatnak.

Példa kérés:

GET /api/products?search=telefon&sort=price_asc&page=1&limit=20&inStock=true


Sikeres válasz – 200 OK:

{
  "products": [
    {
      "productId": 1,
      "name": "Example Product",
      "manufacturer": "Example Manufacturer",
      "color": "Black",
      "price": 199.99,
      "onStock": 10,
      "inStock": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}


A termékadatok és a darabszámok csak példák.

Hibák:

400 Bad Request – érvénytelen keresési szöveg, szűrő, ár, rendezés vagy lapozási paraméter.
500 Internal Server Error – a termékek lekérése sikertelen.
GET /api/products/filters

Lekéri a termékekhez használható szűrési lehetőségeket.

Hitelesítés: nem szükséges.

Sikeres válasz – 200 OK:

{
  "colors": [
    "Black",
    "Blue",
    "White"
  ],
  "manufacturers": [
    "Manufacturer A",
    "Manufacturer B"
  ],
  "price": {
    "min": 10,
    "max": 999
  }
}


A visszaadott színek és gyártók az adatbázisban található értékekből származnak. Az azonos értékek kis- és nagybetűtől, valamint az ékezetektől függetlenül egyedinek számítanak.

Hibák:

500 Internal Server Error – a szűrők lekérése sikertelen.
GET /api/products/:productId

Egy termék adatainak lekérése azonosító alapján.

Hitelesítés: nem szükséges.

Példa kérés:

GET /api/products/1


Sikeres válasz – 200 OK:

{
  "product": {
    "productId": 1,
    "name": "Example Product",
    "manufacturer": "Example Manufacturer",
    "color": "Black",
    "price": 199.99,
    "onStock": 10,
    "inStock": true
  }
}


Hibák:

400 Bad Request – érvénytelen termékazonosító.
404 Not Found – a termék nem található.
500 Internal Server Error – a lekérdezés sikertelen.
6.4. Bevásárlókosár

A kosár minden művelete bejelentkezéshez kötött. A backend a kosár rekordjait a bejelentkezett felhasználó azonosítójához kapcsolja.

POST /api/cart

Termék hozzáadása a kosárhoz, vagy a meglévő mennyiség növelése.

Hitelesítés: kötelező.

Kérés törzse:

{
  "productId": 1,
  "quantity": 2
}


A quantity elhagyásakor az alapértelmezett érték 1.

Működés:

Ellenőrzi, hogy a termék létezik-e.
Ellenőrzi a rendelkezésre álló készletet.
Meglévő kosártétel esetén növeli a mennyiséget.
Új kosártétel esetén új rekordot hoz létre.
Azonos felhasználóhoz és termékhez tartozó esetleges duplikált rekordokat összevonja.
Kiszámítja a tétel teljes árát.

Sikeres válasz – 200 OK:

{
  "message": "Product added to cart",
  "item": {
    "productId": 1,
    "name": "Example Product",
    "quantity": 2,
    "unitPrice": 199.99,
    "totalPrice": 399.98
  }
}


Hibák:

400 Bad Request – érvénytelen termékazonosító vagy mennyiség.
401 Unauthorized – nincs bejelentkezve a felhasználó.
404 Not Found – a termék nem létezik.
409 Conflict – nincs elegendő készlet.
500 Internal Server Error – a művelet sikertelen.
PATCH /api/cart

Egy meglévő kosártétel mennyiségének beállítása.

Hitelesítés: kötelező.

Kérés törzse:

{
  "productId": 1,
  "quantity": 3
}


A quantity az új teljes mennyiség, nem a változtatás mértéke.

Sikeres válasz – 200 OK:

{
  "message": "Cart quantity updated",
  "item": {
    "productId": 1,
    "name": "Example Product",
    "quantity": 3,
    "unitPrice": 199.99,
    "totalPrice": 599.97
  }
}


Hibák:

400 Bad Request – érvénytelen adatok.
401 Unauthorized – nincs bejelentkezve a felhasználó.
404 Not Found – a termék vagy a kosártétel nem található.
409 Conflict – nincs elegendő készlet.
500 Internal Server Error – a módosítás sikertelen.
DELETE /api/cart

Termék eltávolítása a kosárból vagy a mennyiség csökkentése.

Hitelesítés: kötelező.

Kérés törzse:

{
  "productId": 1,
  "quantity": 1
}


Működés:

Ha a quantity nincs megadva, a teljes kosártételt eltávolítja.
Ha a megadott mennyiség eléri vagy meghaladja a kosárban szereplő mennyiséget, a teljes tételt törli.
Egyébként csökkenti a mennyiséget, és újraszámítja az árat.

Sikeres válasz – 200 OK, teljes eltávolításkor:

{
  "message": "Product removed from cart",
  "item": {
    "action": "removed",
    "productId": 1
  }
}


Sikeres válasz – mennyiségcsökkentéskor:

{
  "message": "Cart quantity updated",
  "item": {
    "action": "quantity_updated",
    "productId": 1,
    "quantity": 2,
    "totalPrice": 399.98
  }
}


Hibák:

400 Bad Request – érvénytelen adatok.
401 Unauthorized – nincs bejelentkezve a felhasználó.
404 Not Found – a termék nincs a kosárban, vagy nem található a termék.
500 Internal Server Error – a művelet sikertelen.
6.5. Rendelések
POST /api/orders

Rendelés leadása a bejelentkezett felhasználó kosarából.

Hitelesítés: kötelező.

Kérés törzse: nem szükséges.

Működés:

Lekéri a felhasználó kosártételeit.
Ellenőrzi, hogy a kosár nem üres.
Ellenőrzi, hogy a termékek léteznek-e.
Ellenőrzi a készletet.
Kiszámítja a rendelés és az egyes tételek teljes árát.
Létrehozza a rendelést pending állapottal.
Elmenti a rendelés tételeit a rendelés pillanatában érvényes névvel és árakkal.
Csökkenti a termékek készletét.
Kiüríti a felhasználó kosarát.

A műveletek adatbázis-tranzakcióban futnak, így a sikertelen rendelésfeladás nem hagyhat részlegesen mentett rendelést vagy készletmódosítást.

Sikeres válasz – 201 Created:

{
  "message": "Order placed successfully. Pay upon delivery.",
  "order": {
    "orderId": 1,
    "totalPrice": 399.98,
    "status": "pending",
    "paymentMethod": "cash_on_delivery",
    "paymentStatus": "pending",
    "items": [
      {
        "productId": 1,
        "name": "Example Product",
        "unitPrice": 199.99,
        "quantity": 2,
        "totalPrice": 399.98
      }
    ]
  }
}


Lehetséges hibák:

400 Bad Request – üres a kosár.
401 Unauthorized – nincs bejelentkezve a felhasználó.
409 Conflict – egy termék nem érhető el, vagy a készlet nem elegendő.
500 Internal Server Error – a rendelés feladása sikertelen.

A rendelésfeladás után a fizetési mód cash_on_delivery, a kezdeti rendelési állapot pedig pending.

GET /api/orders/:orderId

Egy adott rendelés részleteinek lekérése.

Hitelesítés: kötelező.

A felhasználó kizárólag a saját rendelését kérheti le.

Példa kérés:

GET /api/orders/1


Sikeres válasz – 200 OK:

{
  "message": "Order details retrieved successfully",
  "order": {
    "orderId": 1,
    "status": "pending",
    "paymentMethod": "cash_on_delivery",
    "paymentStatus": "pending",
    "totalPrice": 399.98,
    "createdAt": "2026-01-01 12:00:00",
    "shippingInfo": {
      "email": "user@example.com",
      "address": "Example Street 10."
    },
    "items": [
      {
        "productId": 1,
        "productName": "Example Product",
        "quantity": 2,
        "pricePerItem": 199.99,
        "itemTotal": 399.98
      }
    ]
  }
}


A dátum és a többi adat formátuma az adatbázis tényleges értékeitől függ.

Hibák:

400 Bad Request – érvénytelen rendelésazonosító.
401 Unauthorized – nincs bejelentkezve a felhasználó.
404 Not Found – a rendelés nem található, vagy nem a bejelentkezett felhasználóhoz tartozik.
500 Internal Server Error – a lekérdezés sikertelen.
PATCH /api/orders/:orderId/cancel

Egy függőben lévő rendelés lemondása.

Hitelesítés: kötelező.

Kérés törzse: nem szükséges.

Példa kérés:

PATCH /api/orders/1/cancel


Működés:

Ellenőrzi, hogy a rendelés a bejelentkezett felhasználóhoz tartozik-e.
Csak pending állapotú rendelés mondható le.
Visszaállítja a rendelt termékek készletét.
A rendelés állapotát cancelled értékre módosítja.
A készlet-visszaállítás és az állapotmódosítás egy tranzakcióban történik.

Sikeres válasz – 200 OK:

{
  "message": "Order cancelled successfully",
  "orderId": 1,
  "orderStatus": "cancelled"
}


Hibák:

400 Bad Request – érvénytelen rendelésazonosító.
401 Unauthorized – nincs bejelentkezve a felhasználó.
404 Not Found – a rendelés nem található.
409 Conflict – a rendelés már le van mondva, kézbesítették, vagy más okból nem mondható le.
500 Internal Server Error – a lemondás sikertelen.
PATCH /api/orders/:orderId/shipping

A rendelés szállítási adatainak módosítása.

Hitelesítés: kötelező.

Kérés törzse:

{
  "email": "user@example.com",
  "shippingAddress": "Example Street 10.",
  "saveToProfile": true
}


Mezők:

email: érvényes szállítási e-mail-cím.
shippingAddress: szállítási cím, 1–1000 karakter.
saveToProfile: logikai érték, amely meghatározza, hogy a szállítási adatok a felhasználói profilba is elmentésre kerüljenek-e. Alapértelmezett értéke false.

Működés:

Ellenőrzi a rendelés tulajdonosát.
Ellenőrzi az e-mail-címet és a szállítási címet.
Elmenti a szállítási adatokat a rendeléshez.
saveToProfile: true esetén frissíti a felhasználói profilban tárolt szállítási adatokat is.
Kézbesített vagy lemondott rendelés szállítási adatai nem módosíthatók.

Sikeres válasz – 200 OK:

{
  "message": "Shipping information updated successfully",
  "orderId": 1,
  "shippingEmail": "user@example.com",
  "shippingAddress": "Example Street 10.",
  "savedToProfile": true
}


Hibák:

400 Bad Request – érvénytelen rendelésazonosító, hiányzó mező, hibás e-mail-cím vagy érvénytelen szállítási cím.
401 Unauthorized – nincs bejelentkezve a felhasználó.
404 Not Found – a rendelés nem található.
409 Conflict – a rendelés állapota miatt a szállítási adatok nem módosíthatók.
500 Internal Server Error – a módosítás sikertelen.
7. Rendelési és fizetési állapotok
7.1. Rendelési állapotok

A kódban az alábbi rendelési állapotok szerepelnek:

Állapot	Jelentés
pending	A rendelés függőben van
delivered	A rendelést kézbesítették
cancelled	A rendelést lemondták

A rendelésfeladáskor a kezdeti állapot pending.

A lemondási végpont kizárólag a pending állapotú rendeléseket engedi lemondani. A delivered és a cancelled állapotú rendelések nem mondhatók le.

A kód nem tartalmaz külön végpontot a rendelés kézbesített állapotba állítására; ezt más alkalmazáslogikának vagy adminisztrációs funkciónak kell kezelnie.

7.2. Fizetési mód

A backend által visszaadott fizetési mód:

cash_on_delivery


Ez utánvétes fizetést jelent.

7.3. Fizetési állapot

A fizetési állapot a rendelés állapotából származik:

Rendelési állapot	Fizetési állapot
pending	pending
delivered	paid
cancelled	cancelled

A kód ezt a leképezést a paymentStatusFor() segédfüggvénnyel valósítja meg. Ez egy alkalmazáslogikai leképezés, nem külső fizetési szolgáltató visszaigazolása.

8. Validáció és adatkezelés

A backend a kérések feldolgozása során többféle ellenőrzést végez.

8.1. Azonosítók

Az URL-ben érkező termék- és rendelésazonosítóknak pozitív egész számoknak kell lenniük, és biztonságosan ábrázolhatónak kell lenniük JavaScriptben.

8.2. E-mail-címek

Az e-mail-címek alapvető formátumellenőrzésen mennek keresztül. Regisztrációkor és a szállítási adatok módosításakor a cím kisbetűsítése és a szélső szóközök eltávolítása megtörténik.

8.3. Jelszavak
Minimum 8 karakter.
Maximum 72 bájt UTF-8 kódolásban.
Hash-elés bcrypttel, 10-es költségi faktorral.
A jelszó nem kerül visszaadásra az API-válaszokban.
8.4. Árkezelés

A backend a termékárakat és a részösszegeket a szerveroldali adatbázisból olvassa ki. A kosár és a rendelés összegét nem a kliens által beküldött ár alapján határozza meg.

Az összegek két tizedesjegyre kerekítése a roundMoney() segédfüggvénnyel történik.

8.5. Készletkezelés

A kosárba helyezés, a mennyiség módosítása és a rendelés leadása során a backend ellenőrzi a készletet.

Rendelésfeladáskor a készlet csökkentése feltételes SQL-művelettel történik. Ha a készlet időközben nem elegendő, a tranzakció meghiúsul.

A rendelés lemondásakor a termékek készlete visszaáll az eredeti mennyiséggel.

9. Middleware és biztonság
9.1. JSON-feldolgozás

A backend az express.json() middleware-t használja a JSON-kérések feldolgozásához.

A maximális kérésméret:

10 KB


A hibás JSON 400 Bad Request, a túl nagy kérés pedig 413 Payload Too Large választ eredményez.

9.2. Rate limiting

A rate limiting alapértelmezett beállítása:

Időablak: 15 perc.
Alapértelmezett limit: 10 kérés az időablakon belül.

Az alábbi végpontok használnak rate limitinget:

POST /api/register
POST /api/login
POST /api/change-password

A bejelentkezési korlátozás a sikeres kéréseket kihagyja a számlálásból.

9.3. Munkamenet-biztonság

A backend az express-session middleware-t használja.

Fontos beállítások:

A cookie neve sid.
A cookie httpOnly beállítású.
A cookie sameSite: 'lax' beállítással rendelkezik.
Éles környezetben a cookie secure beállítása aktív.
A munkamenetek SQLite adatbázisban tárolódnak.
Sikeres bejelentkezéskor a munkamenet megújul, csökkentve a session fixation kockázatát.
Jelszómódosításkor a többi munkamenet törlődik.

A trust proxy beállítás értéke 1, ezért a telepítési környezetben a proxybeállításoknak megfelelően kell működniük.

9.4. SQL-lekérdezések

Az adatbázis-lekérdezések paraméterezett SQL-t használnak a legtöbb felhasználói adat bevitelekor.

A rendezési módok előre meghatározott listából választhatók, nem közvetlenül a kliens által megadott SQL-kifejezések kerülnek a lekérdezésekbe.

9.5. Hibakezelés

A backend központi hibakezelő middleware-t használ.

A kliens felé általános hibaüzeneteket küld, a részletesebb hibainformációkat pedig a szerver naplójába írja.

10. HTTP-státuszkódok
HTTP-státuszkód	Jelentés
200 OK	A kérés sikeres
201 Created	Új erőforrás jött létre
400 Bad Request	Hibás kérés vagy validációs hiba
401 Unauthorized	Hiányzó vagy érvénytelen hitelesítés
403 Forbidden	A művelet tiltott, például hibás jelenlegi jelszó miatt
404 Not Found	Az erőforrás nem található
409 Conflict	Ütközés, például foglalt e-mail-cím vagy elégtelen készlet
413 Payload Too Large	A kérés törzse túl nagy
500 Internal Server Error	Szerveroldali hiba

A hibaválaszok általános formátuma:

{
  "error": "Error message"
}


Egyes végpontok további információkat is visszaadhatnak, például az elérhető készlet mennyiségét vagy az érintett termék azonosítóját.

11. Statikus fájlok

A backend az Express statikusfájl-middleware-ével szolgálja ki a static könyvtár tartalmát.

app.use(express.static('static'))


A regisztrációs és bejelentkezési oldalak külön útvonalon is elérhetők:

GET /register
GET /login

Ezek a következő fájlokat szolgálják ki:

static/register.html
static/login.html
12. API-végpontok összefoglalása
HTTP-metódus	Útvonal	Hitelesítés	Funkció
GET	/register	Nem	Regisztrációs oldal
POST	/api/register	Nem	Regisztráció
GET	/login	Nem	Bejelentkezési oldal
POST	/api/login	Nem	Bejelentkezés
POST	/api/logout	Nem kötelező	Kijelentkezés
POST	/api/change-password	Igen	Jelszómódosítás
GET	/api/profile	Igen	Profil lekérdezése
GET	/api/products	Nem	Terméklista, keresés, szűrés, rendezés, lapozás
GET	/api/products/filters	Nem	Termékszűrők lekérdezése
GET	/api/products/:productId	Nem	Termékrészletek
POST	/api/cart	Igen	Termék hozzáadása a kosárhoz
PATCH	/api/cart	Igen	Kosármennyiség beállítása
DELETE	/api/cart	Igen	Termék eltávolítása vagy mennyiségcsökkentés
POST	/api/orders	Igen	Rendelés leadása
GET	/api/orders/:orderId	Igen	Rendelés részletei
PATCH	/api/orders/:orderId/cancel	Igen	Rendelés lemondása
PATCH	/api/orders/:orderId/shipping	Igen	Szállítási adatok módosítása
13. Példák a frontend és a backend közötti kommunikációra
13.1. Bejelentkezés

A böngészős frontend fetch() segítségével küldheti el a bejelentkezési adatokat:

const response = await fetch('/api/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
        email: 'user@example.com',
        password: 'example-password'
    })
})

const data = await response.json()

if (!response.ok) {
    throw new Error(data.error || 'Login failed')
}

console.log(data.message)

13.2. Termékek lekérése
const response = await fetch(
    '/api/products?sort=price_asc&page=1&limit=20'
)

const data = await response.json()

if (!response.ok) {
    throw new Error(data.error || 'Could not load products')
}

console.log(data.products)
console.log(data.pagination)

13.3. Termék hozzáadása a kosárhoz
const response = await fetch('/api/cart', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
        productId: 1,
        quantity: 2
    })
})

const data = await response.json()

if (!response.ok) {
    throw new Error(data.error || 'Could not add product to cart')
}

console.log(data.item)

13.4. Rendelés leadása
const response = await fetch('/api/orders', {
    method: 'POST',
    credentials: 'include'
})

const data = await response.json()

if (!response.ok) {
    throw new Error(data.error || 'Could not place order')
}

console.log(data.order)


A példákban szereplő azonosítók, árak, e-mail-címek és egyéb adatok demonstrációs célúak.

14. Fontos megjegyzések és továbbfejlesztési lehetőségek
A backend jelenlegi kódja nem tartalmaz külön adminisztrátori API-t a termékek létrehozásához, módosításához vagy törléséhez.
A backend nem tartalmaz külön végpontot a rendelési állapotok adminisztratív módosítására.
A kosár lekérdezésére nincs külön GET /api/cart végpont a bemutatott implementációban.
A Modify Profile szekcióhoz nem tartozik megvalósított profilfrissítő végpont.
A rendelés szállítási adatai a rendelés leadásakor nincsenek automatikusan átvéve a felhasználói profilból; azokat a szállítási végponttal lehet megadni vagy módosítani.
A munkamenet-cookie törlésekor érdemes a cookie beállításait a létrehozáskor használt beállításokkal összehangolni.
Éles környezetben ajánlott a rate limiter tartós vagy megosztott tárolóval történő konfigurálása, különösen több szerverpéldány esetén.
Éles környezetben célszerű a CSRF-védelmet is megvizsgálni, mivel a hitelesítés cookie-alapú.
A trust proxy beállítást kizárólag a tényleges infrastruktúrának megfelelően szabad konfigurálni.
A pénzügyi adatokhoz érdemes SQLite INTEGER alapú, legkisebb pénzegységben történő tárolását vagy megfelelő decimális kezelést alkalmazni, hogy a lebegőpontos számábrázolásból eredő problémák elkerülhetők legyenek.
A rendelési tételek idegen kulcsainak és a termékek törlésére vonatkozó szabályoknak összhangban kell lenniük a rendelési előzmények megőrzésével.
A regisztrációs és bejelentkezési végpontoknál célszerű további naplózást és monitorozást kialakítani a visszaélések felismerésére.
15. Összefoglalás

A backend egy SQLite-alapú, Express.js REST API, amely egy webáruház alapvető működését biztosítja.

A főbb funkciói a felhasználói hitelesítés, a termékek lekérdezése és szűrése, a kosár kezelése, a készletellenőrzés, a rendelések leadása és lemondása, valamint a szállítási adatok kezelése.

A rendszer a jelszavak biztonságos hash-elését, a munkamenetek kezelését, a paraméterezett SQL-lekérdezéseket, a bemeneti adatok validációját és a kritikus rendelési műveletek tranzakciós végrehajtását alkalmazza.
