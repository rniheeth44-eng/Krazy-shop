const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
          ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
          ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits,
          AttachmentBuilder } = require('discord.js')
  const { QuickDB } = require('quick.db')

  const db = new QuickDB()
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildEmojisAndStickers,
    ],
    partials: [Partials.Channel, Partials.Message],
  })

  const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TOKEN || process.env.DISCORD_TOKEN
  if (!BOT_TOKEN) { console.error('❌ No bot token found. Set BOT_TOKEN env var.'); process.exit(1) }

  // ─── Colors ───
  const C = { RED: 0xe74c3c, GREEN: 0x2ecc71, BLUE: 0x3498db, GOLD: 0xf1c40f }
  const ok  = (t, d) => new EmbedBuilder().setColor(C.GREEN).setTitle(t).setDescription(d)
  const err = (t, d) => new EmbedBuilder().setColor(C.RED).setTitle(t).setDescription(d)

  // ─── Stock Emoji Definitions ───
  const STOCK_ITEM_DEFS = [
    { key:"tp2_auto_advertiser", label:"auto-advertiser",  name:"daccounts",          id:"1147841794613202974", animated:false },
    { key:"tp2_h1t_bot",         label:"h1t-bot",          name:"pbot",               id:"1462448626134548563", animated:true  },
    { key:"tp2_sab_stock",       label:"sab-stock",        name:"pdragon",            id:"1457870460954873878", animated:false },
    { key:"tp2_b0osts",          label:"b0Osts",           name:"pboost",             id:"1457349683696373893", animated:false },
    { key:"tp2_members",         label:"m3mbers-on-off",   name:"pmembers",           id:"1479652731747831900", animated:false },
    { key:"tp2_reactions",       label:"reactions",        name:"pjoesmile",          id:"1410754780925526076", animated:false },
    { key:"tp2_auto_chat",       label:"auto-chat",        name:"pshoppingcart",      id:"1462141951536267427", animated:false },
    { key:"tp2_auto_trade",      label:"auto-trade",       name:"pshoppingcartgreen", id:"1462450236734701661", animated:false },
    { key:"tp2_auto_vouches",    label:"auto-vouches",     name:"pverified",          id:"1468974966090371136", animated:false },
    { key:"tp2_nitro_gl",        label:"nitro-gl",         name:"pnitro",             id:"1246901197114314926", animated:false },
    { key:"tp2_profile_deco",    label:"profile-deco",     name:"paa10profile",       id:"1130420579309199380", animated:false },
    { key:"tp2_name_plate",      label:"name-plate",       name:"pplatinumrank",      id:"1478038441747808410", animated:false },
    { key:"tp2_profile_effect",  label:"profile-effect",   name:"ptikbowgreen",       id:"1475133551828537365", animated:true  },
  ]
  const stockEmojiCache = new Map()

  async function setupStockEmojis(client) {
    try {
      const appId = client.application.id
      const existing = await client.rest.get(`/applications/${appId}/emojis`)
      const existingMap = new Map((existing.items || []).map(e => [e.name, e]))
      for (const item of STOCK_ITEM_DEFS) {
        if (existingMap.has(item.name)) {
          const e = existingMap.get(item.name)
          stockEmojiCache.set(item.key, item.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`)
          continue
        }
        try {
          const ext = item.animated ? 'gif' : 'png'
          const imgBuf = await (await fetch(`https://cdn.discordapp.com/emojis/${item.id}.${ext}`)).arrayBuffer()
          const uploaded = await client.rest.post(`/applications/${appId}/emojis`, {
            body: { name: item.name, image: `data:image/${ext};base64,${Buffer.from(imgBuf).toString('base64')}` }
          })
          if (uploaded?.id) {
            stockEmojiCache.set(item.key, item.animated ? `<a:${uploaded.name}:${uploaded.id}>` : `<:${uploaded.name}:${uploaded.id}>`)
            console.log(`✅ Uploaded emoji: ${item.name}`)
          }
          await new Promise(r => setTimeout(r, 600))
        } catch(e) { console.warn(`⚠️ Emoji upload failed (${item.name}): ${e.message}`) }
      }
      console.log(`✅ stockEmojiCache ready: ${stockEmojiCache.size}/${STOCK_ITEM_DEFS.length}`)
    } catch(e) { console.warn('⚠️ setupStockEmojis:', e.message) }
  }

  // ─── Fuzzy match helper ───
  const lev = (a, b) => {
    const m = a.length, n = b.length
    const d = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i?j?0:i:j))
    for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]:1+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1])
    return d[m][n]
  }
  const fuzzyFindItem = (name) => {
    let best = null, bestDist = 3
    for (const i of STOCK_ITEM_DEFS) {
      for (const s of [i.label, i.name, i.key]) {
        const d = lev(name, s.toLowerCase())
        if (d < bestDist) { bestDist = d; best = i }
      }
    }
    return best
  }

  // ─── Admin check ───
  const isAdmin = async (member) =>
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)

  // ─── Ready ───
  client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online!`)
    setupStockEmojis(client).catch(console.warn)
  })

  // ─── Message handler ───
  client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return
    const prefix = '.'
    if (!message.content.startsWith(prefix)) return
    const args = message.content.slice(prefix.length).trim().split(/\s+/)
    const cmd = args.shift().toLowerCase()
    const { member, guild } = message

    // ─── .ticketpanel2 ───
    if (cmd === 'ticketpanel2') {
      if (!await isAdmin(member)) return message.reply({ embeds: [err('No Permission', 'Admin only')] })
      const embed = new EmbedBuilder()
        .setColor(0xADD8E6)
          .setTitle('Open a ticket!')
          .setDescription(
            "Please open a ticket to purchase from our server.\n" +
            "Troll tickets / wasting time will result in an instant ban.\n\n" +
            "## WARRANTY\n" +
            "We typically will not provide refunds, only replacements unless stated otherwise. The issue must be on our side.\n" +
            "Refund prices may fluctuate depending on the supplier.\n" +
            "*Read # // 🥞 • tos before opening.*"
          )
          .setImage('attachment://ticketpanel2_banner.jpg')
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('tp2_select')
          .setPlaceholder('🛒 Select Purchase Type')
          .addOptions([
            new StringSelectMenuOptionBuilder().setLabel('auto-advertiser').setEmoji({ id: '1147841794613202974', name: 'daccounts' }).setValue('tp2_auto_advertiser'),
            new StringSelectMenuOptionBuilder().setLabel('h1t-bot').setEmoji({ id: '1462448626134548563', name: 'bot', animated: true }).setValue('tp2_h1t_bot'),
            new StringSelectMenuOptionBuilder().setLabel('sab-stock').setEmoji({ id: '1457870460954873878', name: 'dragon' }).setValue('tp2_sab_stock'),
            new StringSelectMenuOptionBuilder().setLabel('b0Osts').setEmoji({ id: '1457349683696373893', name: 'boost' }).setValue('tp2_b0osts'),
            new StringSelectMenuOptionBuilder().setLabel('m3mbers-on-off').setEmoji({ id: '1479652731747831900', name: 'members' }).setValue('tp2_members'),
            new StringSelectMenuOptionBuilder().setLabel('reactions').setEmoji({ id: '1410754780925526076', name: 'joesmile' }).setValue('tp2_reactions'),
            new StringSelectMenuOptionBuilder().setLabel('auto-chat').setEmoji({ id: '1462141951536267427', name: '9183shoppingcart' }).setValue('tp2_auto_chat'),
            new StringSelectMenuOptionBuilder().setLabel('auto-trade').setEmoji({ id: '1462450236734701661', name: 'shopping_cart_green' }).setValue('tp2_auto_trade'),
            new StringSelectMenuOptionBuilder().setLabel('auto-vouches').setEmoji({ id: '1468974966090371136', name: 'Verified' }).setValue('tp2_auto_vouches'),
            new StringSelectMenuOptionBuilder().setLabel('nitro-gl').setEmoji({ id: '1246901197114314926', name: 'nitro' }).setValue('tp2_nitro_gl'),
            new StringSelectMenuOptionBuilder().setLabel('profile-deco').setEmoji({ id: '1130420579309199380', name: 'aa10_profile' }).setValue('tp2_profile_deco'),
            new StringSelectMenuOptionBuilder().setLabel('name-plate').setEmoji({ id: '1478038441747808410', name: 'Platinum_Rank' }).setValue('tp2_name_plate'),
            new StringSelectMenuOptionBuilder().setLabel('profile-effect').setEmoji({ id: '1475133551828537365', name: 'tikbow_green', animated: true }).setValue('tp2_profile_effect'),
          ])
      )
      const banner = new AttachmentBuilder('./assets/ticketpanel2_banner.jpg')
      return message.channel.send({ embeds: [embed], components: [row], files: [banner] })
    }

    // ─── .stock ───
    if (cmd === 'stock') {
      const lines = await Promise.all(STOCK_ITEM_DEFS.map(async (item, i) => {
        const qty = (await db.get(`stock_${item.key}_${guild.id}`)) ?? 0
        const status = qty > 0 ? `In Stock (${qty})` : 'Out of Stock'
        const e = stockEmojiCache.get(item.key) || ''
        return `${(i+1).toString().padStart(2,'0')}. ${e ? e+' ' : ''}**${item.label}** — ${status}`
      }))
      const sections = [
        { name: '— Accounts & Bots —',  indices: [0,1,2] },
        { name: '— Boosts & Members —', indices: [3,4] },
        { name: '— Auto Products —',    indices: [5,6,7,8] },
        { name: '— Nitro & Profile —',  indices: [9,10,11,12] },
      ]
      const embed = new EmbedBuilder()
        .setColor(C.BLUE)
        .setTitle('🛒 Current Stock')
        .setDescription(`Stock availability for all products offered by **${guild.name}**.`)
        .setFooter({ text: `Requested by ${message.author.username} • ${guild.name}` })
        .setTimestamp()
      for (const s of sections)
        embed.addFields({ name: s.name, value: s.indices.map(i => lines[i]).join('\n'), inline: false })
      return message.reply({ embeds: [embed] })
    }

    // ─── .addstock ───
    if (cmd === 'addstock') {
      if (!await isAdmin(member)) return message.reply({ embeds: [err('No Permission', 'Admin only')] })
      const itemName = args.slice(0, args.length > 1 && !isNaN(args[args.length-1]) ? -1 : args.length).join(' ').toLowerCase()
      const amount = !isNaN(args[args.length-1]) ? parseInt(args[args.length-1]) : 1
      const found = STOCK_ITEM_DEFS.find(i => i.label===itemName||i.name===itemName||i.key===itemName) || fuzzyFindItem(itemName)
      if (!found) {
        const list = STOCK_ITEM_DEFS.map(i => `• ${stockEmojiCache.get(i.key)||''} ${i.label}`).join('\n')
        return message.reply({ embeds: [err('Item Not Found', `Valid items:\n${list}`)] })
      }
      const current = (await db.get(`stock_${found.key}_${guild.id}`)) ?? 0
      const newQty = current + amount
      await db.set(`stock_${found.key}_${guild.id}`, newQty)
      return message.reply({ embeds: [ok('Stock Updated', `${stockEmojiCache.get(found.key)||''} **${found.label}**\nAdded: +${amount}\nNew total: ${newQty}`)] })
    }

    // ─── .removestock ───
    if (cmd === 'removestock') {
      if (!await isAdmin(member)) return message.reply({ embeds: [err('No Permission', 'Admin only')] })
      const itemName = args.slice(0, args.length > 1 && !isNaN(args[args.length-1]) ? -1 : args.length).join(' ').toLowerCase()
      const amount = !isNaN(args[args.length-1]) ? parseInt(args[args.length-1]) : 1
      const found = STOCK_ITEM_DEFS.find(i => i.label===itemName||i.name===itemName||i.key===itemName) || fuzzyFindItem(itemName)
      if (!found) return message.reply({ embeds: [err('Item Not Found', 'Use `.stock` to see valid items.')] })
      const current = (await db.get(`stock_${found.key}_${guild.id}`)) ?? 0
      const newQty = Math.max(0, current - amount)
      await db.set(`stock_${found.key}_${guild.id}`, newQty)
      return message.reply({ embeds: [ok('Stock Updated', `${stockEmojiCache.get(found.key)||''} **${found.label}**\nRemoved: -${amount}\nNew total: ${newQty}`)] })
    }
  })

  // ─── Interaction handler ───
  client.on('interactionCreate', async interaction => {
    try {
      // tp2 select menu
      if (interaction.isStringSelectMenu() && interaction.customId === 'tp2_select') {
        const selected = interaction.values[0]
        const modalConfigs = {
          tp2_auto_advertiser: { title:'Auto Advertiser', q1:'What version are you buying?',          q1ph:'Eg: Micro / Basic / Premium',   extra:false },
          tp2_h1t_bot:         { title:'H1T Bot',         q1:'Which bot are you buying?',             q1ph:'Eg: 500m hitbot',               extra:false },
          tp2_sab_stock:       { title:'Sab Stock',       q1:'What Brainrot are you buying?',         q1ph:'Eg: Tralalelo tralala',          extra:false },
          tp2_b0osts:          { title:'B0Osts',          q1:'Which type are you buying?',            q1ph:'Eg: Server boosts',             extra:true,  q2:'How much?', q2ph:'Eg: 14 boosts' },
          tp2_members:         { title:'Members',         q1:'Which type of members are you buying?', q1ph:'Eg: Offline / Online',          extra:true,  q2:'How much?', q2ph:'Eg: 1000 members' },
          tp2_reactions:       { title:'Reactions',       q1:'How much are you buying?',              q1ph:'Eg: 500 reactions',             extra:false },
          tp2_auto_chat:       { title:'Auto Chat',       q1:'How many tokens are you buying?',       q1ph:'Eg: 500 tokens',                extra:false },
          tp2_auto_trade:      { title:'Auto Trade',      q1:'How many tokens are you buying?',       q1ph:'Eg: 500 tokens',                extra:false },
          tp2_auto_vouches:    { title:'Auto Vouches',    q1:'How many tokens are you buying?',       q1ph:'Eg: 500 tokens',                extra:false },
          tp2_nitro_gl:        { title:'Nitro GL',        q1:'What type of version are you buying?',  q1ph:'Eg: Basic / Boost',             extra:false },
          tp2_profile_deco:    { title:'Profile Deco',    q1:'What profile deco are you buying?',     q1ph:'Eg: Sakura / Neon',             extra:false },
          tp2_name_plate:      { title:'Name Plate',      q1:'What name plate are you buying?',       q1ph:'Eg: Challenger / Gold',         extra:false },
          tp2_profile_effect:  { title:'Profile Effect',  q1:'What profile effect are you buying?',   q1ph:'Eg: Snowfall / Confetti',       extra:false },
        }
        const cfg = modalConfigs[selected]
        if (!cfg) return interaction.reply({ content: 'Unknown selection.', ephemeral: true })
        const modal = new ModalBuilder().setCustomId(`mm_form2_${selected}`).setTitle(`Purchase Form — ${cfg.title}`)
        const q1 = new TextInputBuilder().setCustomId('q1').setLabel(cfg.q1).setStyle(TextInputStyle.Short).setPlaceholder(cfg.q1ph).setRequired(true)
        const pay = new TextInputBuilder().setCustomId('payment_method').setLabel('Payment method').setStyle(TextInputStyle.Short).setPlaceholder('Eg: LTC / BTC / PayPal').setRequired(true)
        const tos = new TextInputBuilder().setCustomId('agree_tos').setLabel('Do you agree to our TOS?').setStyle(TextInputStyle.Short).setRequired(true)
        if (cfg.extra) {
          const q2 = new TextInputBuilder().setCustomId('q2').setLabel(cfg.q2).setStyle(TextInputStyle.Short).setPlaceholder(cfg.q2ph).setRequired(true)
          modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2), new ActionRowBuilder().addComponents(pay), new ActionRowBuilder().addComponents(tos))
        } else {
          modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(pay), new ActionRowBuilder().addComponents(tos))
        }
        return interaction.showModal(modal)
      }

      // modal submit
      if (interaction.isModalSubmit() && interaction.customId.startsWith('mm_form2_tp2_')) {
        const purchaseType = interaction.customId.replace('mm_form2_', '')
        const q1Val = interaction.fields.getTextInputValue('q1')
        const q2Val = (() => { try { return interaction.fields.getTextInputValue('q2') } catch { return null } })()
        const paymentMethod = interaction.fields.getTextInputValue('payment_method')
        const agreeTos = interaction.fields.getTextInputValue('agree_tos')
        const ticketRoleId = await db.get(`ticketrole2_${interaction.guild.id}`)
        const typeLabels = {
          tp2_auto_advertiser:{ name:'Auto Advertiser', q1Label:'Version' },
          tp2_h1t_bot:        { name:'H1T Bot',         q1Label:'Bot' },
          tp2_sab_stock:      { name:'Sab Stock',       q1Label:'Brainrot' },
          tp2_b0osts:         { name:'B0Osts',          q1Label:'Type' },
          tp2_members:        { name:'Members',         q1Label:'Type' },
          tp2_reactions:      { name:'Reactions',       q1Label:'Amount' },
          tp2_auto_chat:      { name:'Auto Chat',       q1Label:'Tokens' },
          tp2_auto_trade:     { name:'Auto Trade',      q1Label:'Tokens' },
          tp2_auto_vouches:   { name:'Auto Vouches',    q1Label:'Tokens' },
          tp2_nitro_gl:       { name:'Nitro GL',        q1Label:'Version' },
          tp2_profile_deco:   { name:'Profile Deco',    q1Label:'Item' },
          tp2_name_plate:     { name:'Name Plate',      q1Label:'Item' },
          tp2_profile_effect: { name:'Profile Effect',  q1Label:'Item' },
        }
        const tl = typeLabels[purchaseType] || { name: purchaseType, q1Label: 'Item' }
        const ticket = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
            ...(ticketRoleId ? [{ id: ticketRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
          ],
        })
        const welcomeEmbed = new EmbedBuilder()
          .setColor(C.RED)
          .setTitle(`🛒 Purchase Ticket — ${tl.name}`)
          .setDescription(`Thank you for choosing us, ${interaction.user}!\n\n*Our staff will be with you shortly. Please wait.*`)
        const formFields = [
          { name: tl.q1Label, value: q1Val, inline: false },
          ...(q2Val ? [{ name: 'Amount', value: q2Val, inline: false }] : []),
          { name: 'Payment Method', value: paymentMethod, inline: false },
          { name: 'Agreed to TOS', value: agreeTos, inline: false },
        ]
        const formEmbed = new EmbedBuilder().setColor(C.BLUE).setTitle('📋 Order Details').addFields(formFields)
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setEmoji('🤑').setStyle(ButtonStyle.Success)
        )
        const roleMention = ticketRoleId ? `<@&${ticketRoleId}> ` : ''
        await ticket.send({ content: `${roleMention}${interaction.user}`, embeds: [welcomeEmbed, formEmbed], components: [closeRow] })
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(C.GREEN).setTitle('✅ Ticket Created').setDescription(`Your ${tl.name} ticket: ${ticket}`).setTimestamp()], ephemeral: true })
      }

      // close ticket button
      if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...', ephemeral: false })
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000)
      }

      // claim ticket button
      if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true })
        return interaction.reply({ content: `🤑 Ticket claimed by ${interaction.user}!` })
      }

    } catch(e) { console.error('Interaction error:', e) }
  })

  client.login(BOT_TOKEN)