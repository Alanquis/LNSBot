const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Pool } = require('pg');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], 
    partials: [Partials.Channel] 
});

const TOKEN = process.env.TOKEN;
const STAFF_CHANNEL_ID = '1412816870087721041'; // Staff application channel

// PostgreSQL setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Store users who have applied
const appliedUsers = new Set();

// Helper to fetch Roblox thumbnail
async function getRobloxThumbnail(username) {
    try {
        // Step 1: Get userId from username
        const userRes = await fetch(`https://api.roproxy.com/users/get-by-username?username=${encodeURIComponent(username)}`);
        const userData = await userRes.json();
        if (!userData.id) { // lowercase "id"
            console.error(`User not found: ${username}`);
            return null;
        }

        const userId = userData.id;

        // Step 2: Get headshot thumbnail
        const thumbRes = await fetch(`https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        const thumbData = await thumbRes.json();

        if (thumbData?.data?.[0]?.imageUrl) {
            console.log(`Fetched thumbnail for ${username}: ${thumbData.data[0].imageUrl}`);
            return thumbData.data[0].imageUrl;
        }

        return null;
    } catch (err) {
        console.error('Error fetching Roblox thumbnail:', err);
        return null;
    }
}


client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register /info and /unlink commands
    const guild = client.guilds.cache.get("1333184657059221644"); // Replace with your server ID
    await guild.commands.create({
        name: 'info',
        description: 'Show a user\'s Westbridge Plate and Roblox Username from their application',
        options: [
            { name: 'user', description: 'The Discord user to view info for', type: 6, required: false }
        ]
    });

    await guild.commands.create({
        name: 'unlink',
        description: 'Remove your application info (role required)',
    });
});

// Recruitment embed
client.on('messageCreate', async (message) => {
    if (!message.guild || !message.content.startsWith('!sendmessage') || !message.member.permissions.has('Administrator')) return;

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('Please mention a valid channel.');

    const embed = new EmbedBuilder()
        .setTitle('Recruitment at London News Service Ltd!')
        .setDescription(`Join our team of Community (Local News) Journalists here at London News Service!
We have NO activity requirements, come on-duty as you wish.
NO training required. Just read through our handbook and you will be set for an amazing career!
NO off-duty crime restrictions! We do not limit you on what you can do off-duty!
Employee of the Week and Month awards inside of your departments.
If you are employed in a Partnered Company, you are eligible for Direct Entry, so please press that button down below.
Complete the application below if you want to apply!`)
        .setColor('#FF69B4')
        .setThumbnail('https://cdn.discordapp.com/attachments/1410978378583900230/1410988091338133745/lns_emb.png');

    const applyButton = new ButtonBuilder().setCustomId('apply_button').setLabel('Apply').setStyle(ButtonStyle.Success);
    const fastButton = new ButtonBuilder().setCustomId('fasttrack_button').setLabel('Fast Track - Partnered Company').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(applyButton, fastButton);

    await channel.send({ embeds: [embed], components: [row] });
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {

   // /info command
if (interaction.isChatInputCommand() && interaction.commandName === 'info') {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
        const res = await pool.query(
            `SELECT westbridge_plate, roblox_username FROM users WHERE user_id = $1`,
            [targetUser.id]
        );

        if (!res.rows.length) {
            return interaction.reply({
                content: 'No application data found for this user.',
                ephemeral: true
            });
        }

        const { westbridge_plate, roblox_username } = res.rows[0];

        // Fetch Roblox thumbnail
        let thumbnail = null;
        if (roblox_username) {
            thumbnail = await getRobloxThumbnail(roblox_username);
        }

        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.username}'s Info`)
            .addFields(
                { name: 'Westbridge Plate', value: westbridge_plate || 'Not set', inline: true },
                { name: 'Roblox Username', value: roblox_username || 'Not set', inline: true },
                { name: 'Roblox Avatar URL', value: thumbnail || 'Not available', inline: false }
            )
            .setColor('#FF69B4');

        if (thumbnail) embed.setThumbnail(thumbnail);

        await interaction.reply({ embeds: [embed], ephemeral: false });

    } catch (err) {
        console.error(err);
        await interaction.reply({ content: 'Error fetching user info.', ephemeral: true });
    }
}

    // /unlink command

    if (interaction.commandName === 'unlink') {
        const modRoleId = '1412844338328899766'; // Replace with your mod role ID
        const member = interaction.member;
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Check if the user is a mod
        if (!member.roles.cache.has(modRoleId)) {
            return interaction.reply({ content: 'Only moderators can use this command.', ephemeral: true });
        }

        try {
            const res = await pool.query(`DELETE FROM users WHERE user_id = $1`, [targetUser.id]);

            if (res.rowCount === 0) {
                return interaction.reply({ content: 'No application data found for this user.', ephemeral: true });
            }

            await interaction.reply({ content: `Application data for ${targetUser.username} has been removed.`, ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Error removing application data.', ephemeral: true });
        }
    }

    // Buttons: apply and fast track
    if (!interaction.isButton()) return;

    if (interaction.customId === 'apply_button' || interaction.customId === 'fasttrack_button') {
        if (appliedUsers.has(interaction.user.id)) {
            await interaction.reply({ content: 'You have already applied!', ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(interaction.customId === 'apply_button' ? 'application_modal' : 'fasttrack_modal')
            .setTitle(interaction.customId === 'apply_button' ? 'LNS Application' : 'Fast Track Application');

        const questions = interaction.customId === 'apply_button'
            ? [
                { id: 'question1', label: 'Westbridge Number Plate', style: TextInputStyle.Short },
                { id: 'question2', label: 'Roblox Username', style: TextInputStyle.Short },
                { id: 'question3', label: 'Question 3', style: TextInputStyle.Paragraph },
                { id: 'question4', label: 'Question 4', style: TextInputStyle.Paragraph }
            ]
            : [
                { id: 'question1', label: 'Westbridge Number Plate', style: TextInputStyle.Short },
                { id: 'question2', label: 'Roblox Username', style: TextInputStyle.Short },
                { id: 'question3', label: 'Why should you be fast tracked?', style: TextInputStyle.Paragraph }
            ];

        modal.addComponents(...questions.map(q => new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(q.id).setLabel(q.label).setStyle(q.style).setRequired(true)
        )));

        await interaction.showModal(modal);
        return;
    }

    // Staff approve/decline buttons
    if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('decline_')) {
        const [action, userId] = interaction.customId.split('_');
        const user = await client.users.fetch(userId);
        if (!user) return;

        const guild = interaction.guild;
        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.find(r => r.id === '1412827458473951372');

        if (action === 'approve') {
            if (role) await member.roles.add(role);
            await user.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Application Approved')
                    .setDescription('Congratulations! Your application has been approved.\n\nHere is the group link: [https://www.roblox.com/communities/17125518/London-News-Service-Ltd#!/about]')
                    .setColor('Green')]
            });
            await interaction.update({ content: `Application approved for <@${userId}>`, components: [] });
        } else {
            await user.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Application Declined')
                    .setDescription('Unfortunately, your application was declined.')
                    .setColor('Red')]
            });
            await interaction.update({ content: `Application declined for <@${userId}>`, components: [] });
        }
        return;
    }
});

// Handle modal submit
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    let questions, isFastTrack = false;
    if (interaction.customId === 'application_modal') questions = ['question1','question2','question3','question4'];
    else if (interaction.customId === 'fasttrack_modal') { questions = ['question1','question2','question3']; isFastTrack = true; }
    else return;

    const answers = {};
    questions.forEach(q => answers[q] = interaction.fields.getTextInputValue(q));
    appliedUsers.add(interaction.user.id);

    // Save to DB
    await pool.query(
        `INSERT INTO users (user_id, westbridge_plate, roblox_username)
         VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET westbridge_plate=$2, roblox_username=$3`,
        [interaction.user.id, answers['question1'], answers['question2']]
    );

    const robloxThumb = await getRobloxThumbnail(answers['question2']);
    const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle('New Application')
        .setDescription(`New application submitted by <@${interaction.user.id}>`)
        .setColor('Yellow')
        .addFields(...Object.keys(answers).map(k => ({ name: k, value: answers[k] })));

    if (robloxThumb) embed.setThumbnail(robloxThumb);

    const approveButton = new ButtonBuilder().setCustomId(`approve_${interaction.user.id}`).setLabel('Approve').setStyle(ButtonStyle.Success);
    const declineButton = new ButtonBuilder().setCustomId(`decline_${interaction.user.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(approveButton, declineButton);

    await staffChannel.send({ embeds: [embed], components: [row] });
    await interaction.user.send('Your application has been submitted to the staff.');
    await interaction.reply({ content: 'Application submitted!', ephemeral: true });
});

client.login(TOKEN);
