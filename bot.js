const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Pool } = require('pg');


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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register /info command
    const guild = client.guilds.cache.get("1333184657059221644"); // Replace with your server ID
    await guild.commands.create({
        name: 'info',
        description: 'Show your Westbridge Plate and Roblox Username from your application'
    });
});

// Helper to fetch Roblox thumbnail
async function getRobloxThumbnail(username) {
    try {
        const res = await fetch(`https://api.roblox.com/users/get-by-username?username=${username}`);
        const data = await res.json();
        if (!data.Id) return null;
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${data.Id}&size=150x150&format=Png&isCircular=true`);
        const thumbData = await thumbRes.json();
        return thumbData.data[0].imageUrl;
    } catch (err) {
        console.error('Error fetching Roblox thumbnail:', err);
        return null;
    }
}

// Recruitment embed
client.on('messageCreate', async (message) => {
    if (!message.guild) return;
    if (!message.content.startsWith('!sendmessage')) return;
    if (!message.member.permissions.has('Administrator')) return;

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

    const applyButton = new ButtonBuilder()
        .setCustomId('apply_button')
        .setLabel('Apply')
        .setStyle(ButtonStyle.Success);

    const fastButton = new ButtonBuilder()
        .setCustomId('fasttrack_button')
        .setLabel('Fast Track - Partnered Company')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(applyButton, fastButton);
    await channel.send({ embeds: [embed], components: [row] });
});

// Handle button interactions and /info
client.on('interactionCreate', async (interaction) => {

    // /info command
    if (interaction.isChatInputCommand() && interaction.commandName === 'info') {
        try {
            const res = await pool.query(
                `SELECT westbridge_plate, roblox_username FROM users WHERE user_id = $1`,
                [interaction.user.id]
            );

            if (res.rows.length === 0) {
                await interaction.reply({ content: 'No application data found. Please submit an application first.', ephemeral: true });
                return;
            }

            const { westbridge_plate, roblox_username } = res.rows[0];

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`${interaction.user.username}'s Info`)
                        .addFields(
                            { name: 'Westbridge Plate', value: westbridge_plate || 'Not set', inline: true },
                            { name: 'Roblox Username', value: roblox_username || 'Not set', inline: true }
                        )
                        .setColor('#FF69B4')
                ],
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Error fetching your info.', ephemeral: true });
        }
        return;
    }

    if (!interaction.isButton()) return;

    // Duplicate prevention
    if (interaction.customId === 'apply_button' || interaction.customId === 'fasttrack_button') {
        if (appliedUsers.has(interaction.user.id)) {
            await interaction.reply({ content: 'You have already applied!', ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(interaction.customId === 'apply_button' ? 'application_modal' : 'fasttrack_modal')
            .setTitle(interaction.customId === 'apply_button' ? 'LNS Application' : 'Fast Track Application');

        // Normal 4-question modal
        if (interaction.customId === 'apply_button') {
            const questions = [
                { id: 'question1', label: 'Westbridge Number Plate', style: TextInputStyle.Short },
                { id: 'question2', label: 'Roblox Username', style: TextInputStyle.Short },
                { id: 'question3', label: 'Question 3', style: TextInputStyle.Paragraph },
                { id: 'question4', label: 'Question 4', style: TextInputStyle.Paragraph }
            ];
            modal.addComponents(...questions.map(q => new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId(q.id).setLabel(q.label).setStyle(q.style).setRequired(true)
            )));
        } else {
            // Fast track 3-question modal
            const questions = [
                { id: 'question1', label: 'Westbridge Number Plate', style: TextInputStyle.Short },
                { id: 'question2', label: 'Roblox Username', style: TextInputStyle.Short },
                { id: 'question3', label: 'Why should you be fast tracked?', style: TextInputStyle.Paragraph }
            ];
            modal.addComponents(...questions.map(q => new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId(q.id).setLabel(q.label).setStyle(q.style).setRequired(true)
            )));
        }

        await interaction.showModal(modal);
        return;
    }

    // Staff approve/decline buttons
    if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('decline_')) {
        const [action, userId] = interaction.customId.split('_');
        const user = await client.users.fetch(userId);

        if (action === 'approve') {
            const guild = interaction.guild;
            const member = await guild.members.fetch(userId);

            const role = guild.roles.cache.find(r => r.id === '1412827458473951372');
            if (role) await member.roles.add(role);

            await user.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Application Approved')
                    .setDescription('Congratulations! Your application has been approved.\n\nHere is the group link: [https://www.roblox.com/communities/17125518/London-News-Service-Ltd#!/about]\nPlease read the staff handbook: [https://docs.google.com/presentation/d/1ogPjPoMWUOJKaEULD5VFDszK2U6EL3Y7uiYW0CR3_6Q/edit?usp=sharing]')
                    .setColor('Green')]
            });

            await interaction.update({ content: `Application approved for <@${userId}>`, components: [] });
        } else {
            const reason = 'Your application did not meet our requirements.';
            await user.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Application Declined')
                    .setDescription(`Unfortunately, your application was declined.\nReason: ${reason}`)
                    .setColor('Red')]
            });
            await interaction.update({ content: `Application declined for <@${userId}>`, components: [] });
        }
    }
});

// Handle modal submit
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    let questions;
    let isFastTrack = false;

    if (interaction.customId === 'application_modal') {
        questions = ['question1', 'question2', 'question3', 'question4'];
    } else if (interaction.customId === 'fasttrack_modal') {
        questions = ['question1', 'question2', 'question3'];
        isFastTrack = true;
    } else return;

    // Collect answers
    const answers = {};
    questions.forEach(q => { answers[q] = interaction.fields.getTextInputValue(q); });

    // Mark as applied
    appliedUsers.add(interaction.user.id);

    // Save Westbridge Plate and Roblox Username in users table (for /info)
    await pool.query(
        `INSERT INTO users (user_id, westbridge_plate, roblox_username)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET westbridge_plate = $2, roblox_username = $3`,
        [interaction.user.id, answers['question1'], answers['question2']]
    );

    // Fetch Roblox thumbnail
    const robloxThumb = await getRobloxThumbnail(answers['question2']);

    // Send staff embed
    const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle('New Application')
        .setDescription(`New application submitted by <@${interaction.user.id}>`)
        .setColor('Yellow')
        .addFields(
            ...Object.keys(answers).map(k => ({ name: k, value: answers[k] }))
        );

    if (robloxThumb) embed.setThumbnail(robloxThumb);

    const approveButton = new ButtonBuilder()
        .setCustomId(`approve_${interaction.user.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
        .setCustomId(`decline_${interaction.user.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(approveButton, declineButton);

    await staffChannel.send({ embeds: [embed], components: [row] });
    await interaction.user.send('Your application has been submitted to the staff. You will be notified via DM once reviewed.');
    await interaction.reply({ content: 'Application submitted!', ephemeral: true });
});

client.login(TOKEN);
