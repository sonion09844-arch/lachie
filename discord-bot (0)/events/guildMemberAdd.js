const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const channelId = config.welcomeChannelId;
    if (!channelId || channelId.startsWith('PUT_')) return;

    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const w = config.welcomeMessage || {};
    const description = (w.description || 'Welcome {user} to **{server}**!')
      .replace(/{user}/g, `${member}`)
      .replace(/{server}/g, member.guild.name);

    const embed = new EmbedBuilder().setDescription(description).setColor(w.color || '#5865F2').setTimestamp();
    if (w.title) embed.setTitle(w.title);
    if (w.thumbnailIsAvatar) embed.setThumbnail(member.user.displayAvatarURL());

    await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
  },
};
