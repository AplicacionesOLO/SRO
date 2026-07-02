# SEQUENCE DIAGRAMS — Suite OLO / App Hub Manager

> **Documentación Enterprise-Grade | Segunda Pasada**
> Diagramas ASCII de secuencia para todas las funcionalidades críticas.
> Basado exclusivamente en el código fuente (v1199).

---

## 1. LOGIN EMAIL/PASSWORD

```
Usuario        LoginPage       AuthContext        Supabase Auth      user_org_roles     role_permissions    ProtectedRoute
  │                │                │                    │                  │                   │                  │
  ├─email+pass────▶│                │                    │                  │                   │                  │
  │                ├─login(e,p)────▶│                    │                  │                   │                  │
  │                │                ├─signInWithPwd()──▶│                  │                   │                  │
  │                │                │    ◀───session────┤                  │                   │                  │
  │                │                ├─loadUserProfile()───────────────────▶│                   │                  │
  │                │                │    ◀───{org_id,role_id}─────────────┤                   │                  │
  │                │                ├─loadPermissions()──────────────────────────────────────▶│                  │
  │                │                │    ◀───Set<permission>──────────────────────────────────┤                  │
  │                │    ◀──User────┤                    │                  │                   │                  │
  │                │                │                    │                  │                   │                  │
  │                │                │                    │                  │                   ├─check user──────▶│
  │                │                │                    │                  │                   │    redirect      │
  │   ◀──redirect /calendario──────│                    │                  │                   │                  │
```

---

## 2. LOGIN GOOGLE OAUTH

```
Usuario     LoginPage    AuthContext       Supabase         Google        onAuthState    loadUserProfile
  │             │             │                │               │               │               │
  ├─click─────▶│             │                │               │               │               │
  │             ├─loginWithGoogle()──────────▶│               │               │               │
  │             │             │   signInWithOAuth()─────────▶│               │               │
  │   ◀──redirect to Google──┤                │               │               │               │
  │             │             │                │               │               │               │
  ├─choose account──────────────────────────────────────────▶│               │               │
  │   ◀──redirect to app────────────────────────────────────┤               │               │
  │             │             │                │               │               │               │
  │             │             │   ◀──SIGNED_IN────────────────┤               │               │
  │             │             ├─setSupabaseUser()────────────────────────────▶│               │
  │             │             ├─loadUserProfile()──────────────────────────────────────────▶│
  │             │             │    ◀──User────────────────────────────────────────────────┤
  │             │             │                │               │               │               │
  │   ◀──redirect /calendario│                │               │               │               │
```

---

## 3. CREAR RESERVA

```
Usuario   ReservationModal  calendarService   create-reservation EF    Supabase      emailTrigger    correspondence-EF    smtp-send
  │            │                  │                    │                  │               │               │                  │
  ├─submit────▶│                  │                    │                  │               │               │                  │
  │            ├─createReserv()──▶│                    │                  │               │               │                  │
  │            │                  ├─functions.invoke()▶│                  │               │               │                  │
  │            │                  │                    ├─getUser(token)──▶│               │               │                  │
  │            │                  │                    │   ◀──user────────┤               │               │                  │
  │            │                  │                    ├─check org───────▶│               │               │                  │
  │            │                  │                    ├─check cutoff────▶│               │               │                  │
  │            │                  │                    ├─INSERT──────────▶│               │               │                  │
  │            │                  │                    │   ◀──reservation─┤               │               │                  │
  │            │                  │   ◀──{data:res}────┤                  │               │               │                  │
  │            │                  ├─ensureQR() bg──────▶│ (storage)       │               │               │                  │
  │            │                  ├─ensureCard() bg────▶│ (storage)       │               │               │                  │
  │            │                  ├─emailTrigger()─────────────────────────────────────▶│               │                  │
  │            │                  │                    │                  │               ├─load rules────▶│               │
  │            │                  │                    │                  │               ├─resolve recip─▶│               │
  │            │                  │                    │                  │               ├─INSERT outbox─▶│               │
  │            │                  │                    │                  │               ├─invoke smtp─────────────────────▶│
  │            │                  │                    │                  │               │               │   SMTP send    │
  │            │   ◀──Reservation─┤                    │                  │               │               │                  │
  │   ◀──modal close─────────────┤                    │                  │               │               │                  │
```

---

## 4. REGISTRO IN (CASETILLA)

```
Usuario   IngresoForm    casetillaService      Supabase          emailTrigger    correspondence-EF
  │           │                │                    │                  │               │
  ├─submit───▶│                │                    │                  │               │
  │           ├─createIngreso()▶                    │                  │               │
  │           │                ├─find reservation──▶│                  │               │
  │           │                │   ◀──reservation───┤                  │               │
  │           │                ├─UPDATE status─────▶│                  │               │
  │           │                │   (ARRIVED_PENDING)│                  │               │
  │           │                ├─sync fields───────▶│                  │               │
  │           │                │   (truck,driver...)│                  │               │
  │           │                ├─INSERT ingreso────▶│                  │               │
  │           │                │   ◀──ingreso───────┤                  │               │
  │           │                ├─emailTrigger()──────────────────────▶│               │
  │           │                │                    │                  ├─statusChanged─▶│
  │           │   ◀──result────┤                    │                  │               │
  │   ◀──OK──┤                │                    │                  │               │
```

---

## 5. REGISTRO OUT (CASETILLA)

```
Usuario   ExitForm      casetillaService      Supabase          emailTrigger
  │          │                │                    │                  │
  ├─submit──▶│                │                    │                  │
  │          ├─createSalida()─▶                    │                  │
  │          │                ├─check existing────▶│                  │
  │          │                ├─find DISPATCHED───▶│                  │
  │          │                ├─UPDATE status─────▶│                  │
  │          │                │   (DISPATCHED)     │                  │
  │          │                ├─INSERT salida─────▶│                  │
  │          │                │   ◀──salida────────┤                  │
  │          │                ├─emailTrigger()──────────────────────▶│
  │          │   ◀──result────┤                    │                  │
  │   ◀──OK──┤                │                    │                  │
```

---

## 6. CHAT IA (SROBOT)

```
Usuario   ChatInput    useChatSession    chatService      ask-sro-chat EF    Supabase      OpenAI
  │          │              │                │                  │              │            │
  ├─pregunta▶│              │                │                  │              │            │
  │          ├─sendMessage()▶               │                  │              │            │
  │          │              ├─optimistic msg │                  │              │            │
  │          │              ├─askChat()─────▶│                  │              │            │
  │          │              │                ├─getSession()────▶│              │            │
  │          │              │                │   ◀──token───────┤              │            │
  │          │              │                ├─fetch(EF)─────────────────────▶│            │
  │          │              │                │                  ├─getUser()───▶│            │
  │          │              │                │                  ├─load perms──▶│            │
  │          │              │                │                  ├─filter docs─▶│            │
  │          │              │                │                  ├─OpenAI API──────────────────▶│
  │          │              │                │                  │   ◀──response───────────────┤
  │          │              │                │                  ├─save msgs────▶│            │
  │          │              │                │   ◀──response────┤              │            │
  │          │              ├─replace optimistic                  │              │            │
  │          │              ├─refresh sessions                   │              │            │
  │   ◀──respuesta──────────┤                │                  │              │            │
```

---

## 7. SINCRONIZACIÓN PROVEEDORES

```
Usuario   ProviderSyncModal   providersService    sync-providers EF    Supabase      API Externa
  │              │                    │                    │               │              │
  ├─sync────────▶│                    │                    │               │              │
  │              ├─fetchFromAPI()──────────────────────────────────────────────────────▶│
  │              │   ◀──providers[]────────────────────────────────────────────────────┤
  │              ├─syncProviders()────▶                    │               │              │
  │              │                    ├─functions.invoke()─▶               │              │
  │              │                    │                    ├─load exist───▶│              │
  │              │                    │                    ├─foreach API provider:        │
  │              │                    │                    │   matched → skip/update      │
  │              │                    │                    │   new → INSERT               │
  │              │                    │                    ├─deactivate──────────────────▶│
  │              │                    │   ◀──result────────┤               │              │
  │              │   ◀──SyncResult────┤                    │               │              │
  │   ◀──success┤                    │                    │               │              │
```

---

## 8. NO SHOW AUTOMÁTICO (CRON)

```
pg_cron        auto-mark-no-show EF       Supabase              activity_log
  │                    │                      │                      │
  ├─POST──────────────▶│                      │                      │
  │  (cron secret)     │                      │                      │
  │                    ├─load NO_SHOW status──▶│                      │
  │                    ├─load warehouses──────▶│                      │
  │                    │   (tolerance > 0)    │                      │
  │                    ├─load docks──────────▶│                      │
  │                    ├─find candidates─────▶│                      │
  │                    │   (no ingreso,       │                      │
  │                    │    past cutoff)      │                      │
  │                    ├─UPDATE batch 50─────▶│                      │
  │                    │   status_id=NO_SHOW  │                      │
  │                    ├─INSERT logs────────────────────────────────▶│
  │   ◀──{processed:N}─┤                      │                      │
```

---

## 9. GENERACIÓN BLOQUES CLIENTE RETIRA

```
ClienteRetira   clientPickupRules   generate-client-pickup-blocks EF    Supabase
  │                   │                          │                        │
  ├─create rule──────▶│                          │                        │
  │                   ├─INSERT rule─────────────▶│                        │
  │                   ├─triggerBlockGeneration()─▶│                        │
  │                   │                          ├─load active rules─────▶│
  │                   │                          ├─load docks────────────▶│
  │                   │                          ├─load warehouses───────▶│
  │                   │                          ├─calc today blocks      │
  │                   │                          │   (dynamic start)      │
  │                   │                          ├─calc future blocks     │
  │                   │                          │   (30 days)            │
  │                   │                          ├─delete today blocks───▶│
  │                   │                          ├─INSERT batch 200──────▶│
  │                   │                          │   reason=CLIENT_PICKUP │
  │                   │                          ├─conflict: skip (P0001) │
  │                   │   ◀──{created,skipped}───┤                        │
  │                   ├─notifyRuleChanged(dockIds)                        │
  │   ◀──Calendar refresh (via Context)                                  │
```

---

## 10. PROCESAMIENTO DOCUMENTO (CONOCIMIENTO)

```
Usuario   ConocimientoPage   knowledgeService   process-knowledge-doc EF   Supabase Storage   OpenAI
  │              │                  │                      │                     │              │
  ├─upload──────▶│                  │                      │                     │              │
  │              ├─uploadAndCreate()▶                      │                     │              │
  │              │                  ├─upload file─────────────────────────────▶│              │
  │              │                  │   ◀──filePath────────────────────────────┤              │
  │              │                  ├─INSERT doc record───▶                     │              │
  │              │                  │   (status=draft)                         │              │
  │              ├─process()───────▶│                      │                     │              │
  │              │                  ├─fetch(EF)───────────▶│                     │              │
  │              │                  │                      ├─validate JWT───────▶               │
  │              │                  │                      ├─download file──────▶               │
  │              │                  │                      │   ◀──blob──────────┤               │
  │              │                  │                      ├─upload to OpenAI──────────────────▶│
  │              │                  │                      │   ◀──openai_file_id───────────────┤
  │              │                  │                      ├─create/get vector store────────────▶│
  │              │                  │                      │   ◀──vector_store_id──────────────┤
  │              │                  │                      ├─add file to vector────────────────▶│
  │              │                  │                      ├─UPDATE doc────────▶                │
  │              │                  │                      │   status=active    │               │
  │              │                  │   ◀──success─────────┤                     │              │
  │   ◀──refresh─┤                  │                      │                     │              │
```

---

## 11. CORRESPONDENCIA (EMAIL DISPATCH)

```
Reservation   emailTrigger       correspondence-process-event EF    Supabase     smtp-send EF    SMTP Server
  │               │                          │                        │              │               │
  ├─status change▶│                          │                        │              │               │
  │               ├─getToken()──────────────▶│                        │              │               │
  │               │   ◀──jwt─────────────────┤                        │              │               │
  │               ├─fetch(process-event)─────▶│                        │              │               │
  │               │                          ├─load reservation──────▶│              │               │
  │               │                          ├─load dock─────────────▶│              │               │
  │               │                          ├─load status───────────▶│              │               │
  │               │                          ├─load rules────────────▶│              │               │
  │               │                          │   (event_type match)   │              │               │
  │               │                          ├─for each rule:         │              │               │
  │               │                          │   resolve recipients   │              │               │
  │               │                          │   process template     │              │               │
  │               │                          │   INSERT outbox───────▶│              │               │
  │               │                          │   (status: queued)     │              │               │
  │               │                          ├─fetch(smtp-send)──────────────────────▶│               │
  │               │                          │                        │              ├─connect───────▶│
  │               │                          │                        │              │   EHLO         │
  │               │                          │                        │              │   STARTTLS     │
  │               │                          │                        │              │   AUTH LOGIN   │
  │               │                          │                        │              │   MAIL FROM    │
  │               │                          │                        │              │   RCPT TO      │
  │               │                          │                        │              │   DATA         │
  │               │                          │                        │              │   ◀──250 OK────┤
  │               │                          │                        │              ├─UPDATE outbox─▶│
  │               │                          │                        │              │   status=sent  │
  │               │   ◀──{queued,sent,failed}┤                        │              │               │
```

---

## 12. DRAG & DROP (CAMBIO DE ESTADO)

```
Usuario   SchedulerView    useBlockedStatuses    calendarService    Supabase    emailTrigger
  │            │                    │                    │              │              │
  ├─drag──────▶│                    │                    │              │              │
  │            ├─isBlockedSync()───▶│                    │              │              │
  │            │   ◀──false─────────┤                    │              │              │
  │            ├─updateReservation()───────────────────▶│              │              │
  │            │                    │                    ├─UPDATE──────▶│              │
  │            │                    │                    │   ◀──OK──────┤              │
  │            │                    │                    ├─SELECT full─▶│              │
  │            │                    │                    ├─emailTrigger()────────────▶│
  │            │   ◀──refresh───────┤                    │              │              │
  │   ◀──moved─┤                    │                    │              │              │
```