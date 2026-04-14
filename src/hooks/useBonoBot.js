import { useState, useCallback } from "react";
import { api } from "@/lib/api";

/**
 * Hook to manage BonoBot chat logic
 */
export function useBonoBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, role: "bot", text: "¡Hola! Soy BonoBot 🤖. ¿En qué puedo ayudarte hoy?" }
    ]);
    const [isTyping, setIsTyping] = useState(false);

    const toggleChat = () => setIsOpen(prev => !prev);

    const sendMessage = useCallback(async (text) => {
        if (!text.trim()) return;

        // 1. Add User Message
        const userMsg = { id: Date.now(), role: "user", text };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        // 2. Fetch from Real AI Backend
        try {
            // Recolectar la meta/contexto básico si el usuario está viendo mi-desempeño
            // Se puede extender después recopilando datos del DOM si quisiéramos enviar contexto del UI
            const clientContext = window.location.pathname.includes("mi-desempeno")
                ? "El usuario está actualmente visualizando su página de 'Mi Desempeño'."
                : "";

            const data = await api('/bot/chat', {
                method: 'POST',
                body: {
                    messages: [...messages, userMsg],
                    clientContext
                }
            });

            if (data && data.reply) {
                setMessages(prev => [...prev, { id: Date.now() + 1, role: "bot", text: data.reply }]);
            } else {
                setMessages(prev => [...prev, { id: Date.now() + 1, role: "bot", text: "Hubo un error al generar mi respuesta. 🤒" }]);
            }
        } catch (error) {
            console.error("Error AI Chat:", error);
            setMessages(prev => [...prev, { id: Date.now() + 1, role: "bot", text: "¡Uy! Parece que mis servidores de inteligencia fallaron. Intentá de nuevo más tarde." }]);
        } finally {
            setIsTyping(false);
        }

    }, [messages]);

    return {
        isOpen,
        toggleChat,
        messages,
        sendMessage,
        isTyping
    };
}
