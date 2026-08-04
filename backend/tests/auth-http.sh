# Tes autentikasi end-to-end lewat HTTP.
# Prasyarat: backend jalan (npm run dev) + ada 2 karyawan aktif untuk diuji.
# Jalankan: npm run test:http
API=${API:-http://localhost:3005/api}
EMP_A=${EMP_A:-TEST-A}
EMP_B=${EMP_B:-TEST-B}
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok   $1 → $2"; else fail=$((fail+1)); echo "  FAIL $1 → dapat $2, harusnya $3"; fi; }
code() { curl -s -o /dev/null -w "%{http_code}" -m 8 "$@"; }

echo "1. Login mobile menerbitkan token"
LOGIN=$(curl -s -m 8 -X POST $API/hr/mobile/login -H 'Content-Type: application/json' -d "{\"nik\":\"$EMP_A\"}")
TOKEN_A=$(echo "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
[ -n "$TOKEN_A" ] && { pass=$((pass+1)); echo "  ok   token diterbitkan"; } || { fail=$((fail+1)); echo "  FAIL tidak ada token: $LOGIN"; }
LOGIN_B=$(curl -s -m 8 -X POST $API/hr/mobile/login -H 'Content-Type: application/json' -d "{\"nik\":\"$EMP_B\"}")
TOKEN_B=$(echo "$LOGIN_B" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
ID_A=$(echo "$LOGIN"   | python3 -c 'import sys,json;print(json.load(sys.stdin).get("employee",{}).get("id",""))')
ID_B=$(echo "$LOGIN_B" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("employee",{}).get("id",""))')

echo
echo "2. SLIP GAJI — inti kebocoran yang diperbaiki"
chk "tanpa token"                 "$(code $API/hr/mobile/payslip/$ID_A)" 401
chk "token A → slip gaji A"       "$(code -H "Authorization: Bearer $TOKEN_A" $API/hr/mobile/payslip/$ID_A)" 200
chk "token A → slip gaji B (!!)"  "$(code -H "Authorization: Bearer $TOKEN_A" $API/hr/mobile/payslip/$ID_B)" 403
chk "token B → slip gaji B"       "$(code -H "Authorization: Bearer $TOKEN_B" $API/hr/mobile/payslip/$ID_B)" 200
chk "token asal-asalan"           "$(code -H "Authorization: Bearer ngawur.token.palsu" $API/hr/mobile/payslip/$ID_A)" 401

echo
echo "3. Absensi & material request"
chk "absensi tanpa token"         "$(code $API/hr/mobile/attendance/$ID_A)" 401
chk "absensi orang lain"          "$(code -H "Authorization: Bearer $TOKEN_A" $API/hr/mobile/attendance/$ID_B)" 403
chk "absensi sendiri"             "$(code -H "Authorization: Bearer $TOKEN_A" $API/hr/mobile/attendance/$ID_A)" 200
chk "MR /my tanpa token"          "$(code $API/material-requests/my)" 401
chk "MR /my dengan token"         "$(code -H "Authorization: Bearer $TOKEN_A" $API/material-requests/my)" 200
chk "MR spoof lama x-employee-id" "$(code -H 'x-employee-id: $ID_A' $API/material-requests/my)" 401

echo
echo "4. Kredensial sidik jari"
chk "list kredensial tanpa token" "$(code $API/webauthn/credentials/$ID_A)" 401
chk "kredensial orang lain"       "$(code -H "Authorization: Bearer $TOKEN_A" $API/webauthn/credentials/$ID_B)" 403
chk "kredensial sendiri"          "$(code -H "Authorization: Bearer $TOKEN_A" $API/webauthn/credentials/$ID_A)" 200

echo
echo "5. Endpoint kantor menolak token mobile"
chk "MR /all tanpa token"         "$(code $API/material-requests/all)" 401
chk "MR /all pakai token mobile"  "$(code -H "Authorization: Bearer $TOKEN_A" $API/material-requests/all)" 401
chk "notes tanpa token"           "$(code $API/notes)" 401
chk "notes pakai token mobile"    "$(code -H "Authorization: Bearer $TOKEN_A" $API/notes)" 401
chk "users pakai token mobile"    "$(code -H "Authorization: Bearer $TOKEN_A" $API/users)" 401
chk "finance pakai token mobile"  "$(code -H "Authorization: Bearer $TOKEN_A" $API/finance/fund-requests)" 401
chk "hr employees token mobile"   "$(code -H "Authorization: Bearer $TOKEN_A" $API/hr/employees)" 401
chk "prospects tanpa token"       "$(code $API/prospects)" 401
chk "offices CRUD tanpa token"    "$(code -X POST $API/webauthn/offices)" 401

echo
echo "6. Token admin"
ADM=$(curl -s -m 8 -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"master@admin.com","password":"master"}')
TOKEN_ADM=$(echo "$ADM" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("token") or d.get("data",{}).get("token",""))')
[ -n "$TOKEN_ADM" ] && { pass=$((pass+1)); echo "  ok   login admin berhasil"; } || { fail=$((fail+1)); echo "  FAIL login admin: $ADM"; }
chk "admin → MR /all"             "$(code -H "Authorization: Bearer $TOKEN_ADM" $API/material-requests/all)" 200
chk "admin → notes"               "$(code -H "Authorization: Bearer $TOKEN_ADM" $API/notes)" 200
chk "admin DITOLAK di slip gaji"  "$(code -H "Authorization: Bearer $TOKEN_ADM" $API/hr/mobile/payslip/$ID_A)" 401
chk "admin → offices (anyAuth)"   "$(code -H "Authorization: Bearer $TOKEN_ADM" $API/webauthn/offices)" 200
chk "mobile → offices (anyAuth)"  "$(code -H "Authorization: Bearer $TOKEN_A" $API/webauthn/offices)" 200

echo
echo "7. Temuan review: registrasi publik & JWT di query string"
chk "register tanpa token"        "$(code -X POST $API/auth/register -H 'Content-Type: application/json' --data-binary @/dev/null)" 401
chk "?token= ditolak di API biasa" "$(code "$API/users?token=$TOKEN_ADM")" 401
chk "?token= diterima di unduhan"  "$(code "$API/projects/files/999999/download?token=$TOKEN_ADM")" 404

echo
echo "=== $pass lulus, $fail gagal ==="
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
