const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config.json');

function parseTopic(topic) {
  if (!topic || !topic.startsWith('ticket|')) return null;
  const [, userId, categoryId] = topic.split('|');
  return { userId, categoryId };
}

function getTicketRoleIds() {
  return (config.ticketRoleIds || []).filter((id) => id && !id.startsWith('PUT_'));
}

function countOpenTicketsForUser(guild, userId) {
  return guild.channels.cache.filter((c) => {
    const meta = parseTopic(c.topic);
    return meta && meta.userId === userId;
  }).size;
}

function buildTicketControlRow(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

async function createTicket(interaction, categoryId) {
  const { guild, user } = interaction;
  const category = (config.categories || []).find((c) => c.id === categoryId);
  if (!category) {
    return interaction.reply({ content: 'Unknown ticket category.', ephemeral: true });
  }

  const existing = countOpenTicketsForUser(guild, user.id);
  if (existing >= (config.maxOpenTicketsPerUser || 2)) {
    return interaction.reply({
      content: `You already have ${existing} open ticket(s). Please close them before opening a new one.`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
  ];

  for (const roleId of getTicketRoleIds()) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';

  const channelOptions = {
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    topic: `ticket|${user.id}|${categoryId}`,
    permissionOverwrites,
  };

  if (config.ticketCategoryId && !config.ticketCategoryId.startsWith('PUT_')) {
    channelOptions.parent = config.ticketCategoryId;
  }

  const channel = await guild.channels.create(channelOptions);

  const welcomeEmbed = new EmbedBuilder()
    .setDescription(
      `Hi ${user}, thanks for reaching out!\n\n` +
        `**Category:** ${category.label}\n` +
        `Please describe your issue in as much detail as possible. A member of our team will be with you shortly.`
    )
    .setColor(config.panel.color || '#5865F2')
    .setTimestamp();
  if (category.label) welcomeEmbed.setTitle(`${category.emoji || '🎫'} ${category.label}`);

  const mentions = getTicketRoleIds()
    .map((id) => `<@&${id}>`)
    .join(' ');

  await channel.send({
    content: `${user} ${mentions}`.trim(),
    embeds: [welcomeEmbed],
    components: [buildTicketControlRow()],
  });

  await interaction.editReply({ content: `Your ticket has been created: ${channel}` });
}

async function claimTicket(interaction) {
  const meta = parseTopic(interaction.channel.topic);
  if (!meta) {
    return interaction.reply({ content: 'This does not look like a ticket channel.', ephemeral: true });
  }

  const member = interaction.member;
  const isTicketStaff = getTicketRoleIds().some((id) => member.roles.cache.has(id));
  if (!isTicketStaff && !member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: 'Only ticket staff can claim tickets.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setDescription(`🙋 This ticket has been claimed by ${interaction.user}.`)
    .setColor('#57F287');

  await interaction.reply({ embeds: [embed] });
  await interaction.message.edit({ components: [buildTicketControlRow(true)] }).catch(() => {});
}

async function closeTicket(interaction) {
  const meta = parseTopic(interaction.channel.topic);
  if (!meta) {
    return interaction.reply({ content: 'This does not look like a ticket channel.', ephemeral: true });
  }

  const member = interaction.member;
  const isTicketStaff = getTicketRoleIds().some((id) => member.roles.cache.has(id));
  const isOwner = member.id === meta.userId;
  if (!isTicketStaff && !isOwner && !member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
  }

  const seconds = config.closeCountdownSeconds || 5;
  await interaction.reply({ content: `🔒 Closing this ticket in ${seconds} seconds…` });

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, seconds * 1000);
}

module.exports = { createTicket, claimTicket, closeTicket, parseTopic, buildTicketControlRow };
